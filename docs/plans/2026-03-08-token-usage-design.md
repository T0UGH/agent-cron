# Token Usage Tracking — Design

## Goal

Track per-task token usage (cost, input/output tokens) from the Claude Agent SDK and surface it in logs and the markdown dashboard.

## Architecture

Data flows through the existing pipeline with minimal changes:

```
ClaudeRunner.run() returns { result, usage }
  → runner.ts passes usage to logger.end()
    → [END] log line gets cost/token fields appended
      → dashboard.ts parses [END] line, adds Cost column to status table
```

## Changes

### 1. AgentRunner interface

`run()` return type changes from `string` to `string | RunResult`:

```typescript
interface RunResult {
  result: string;
  cost?: number;        // USD
  inputTokens?: number;
  outputTokens?: number;
}
```

Returning a plain string remains valid (backward-compatible for shell runner and custom runners).

### 2. ClaudeRunner

Extract `total_cost_usd`, `usage.input_tokens`, `usage.output_tokens` from the SDK's `result` message. Return `RunResult` object instead of bare string.

### 3. Logger.end()

Accept optional usage parameter. Append to [END] line:

```
[END] status=ok duration=10000ms cost=0.0123 in=1500 out=800
```

### 4. runner.ts

Normalize `AgentRunner.run()` return value (string vs RunResult). Pass usage to `logger.end()`.

### 5. dashboard.ts

Parse `cost=` from [END] line. Add "Cost" column to status table. Display "-" when cost is absent (shell tasks, old logs).

## Log Format

```
[2026-03-08 10:00:11.000] [END]   status=ok duration=10000ms cost=0.0123 in=1500 out=800
```

Backward-compatible: old logs without cost/in/out fields display "-" in dashboard.

## Non-goals

- Per-model breakdown in dashboard
- Daily/weekly cost aggregation
- Cache token tracking
- Cost alerts or budgets
