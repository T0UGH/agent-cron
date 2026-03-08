# Task Timeout — Design

## Goal

Prevent tasks from running indefinitely by adding configurable timeout support with a global default of 10 minutes.

## Configuration

Task frontmatter supports an optional `timeout` field (minutes):

```yaml
---
name: AI News
cron: "30 23 * * *"
timeout: 15
---
```

- Not specified → uses global default (10 minutes)
- Set to `0` → no timeout

## Architecture

Timeout is enforced in `runner.ts` using `AbortController` + `setTimeout`, making it agent-agnostic:

```
runner.ts creates AbortController + setTimeout
  → passes signal to agentRunner.run()
    → ClaudeRunner passes signal to SDK query() via abortController
    → ShellRunner passes signal to exec() (Node.js native support)
  → on timeout: abort fires, catch detects abort, logs error
```

## Changes

1. **`AgentRunner` interface** — add optional `signal?: AbortSignal` as 4th parameter to `run()`
2. **`runner.ts`** — create `AbortController`, set `setTimeout` for `task.timeout` (default 10) minutes, pass `signal` to runner, detect abort in catch block, log `status=error error="timeout after Xm"`, `clearTimeout` in finally
3. **`ClaudeRunner`** — accept `signal`, create linked `AbortController` from signal, pass to SDK `query()` options
4. **`ShellRunner`** — accept `signal`, pass to `execAsync` options, remove hardcoded 2-minute timeout

## Timeout behavior

- Logs `[END] status=error error="timeout after 10m"`
- Task removed from queue, next task proceeds
- No retry

## Non-goals

- Retry on timeout
- Cost-based budget limits
- Per-runner timeout logic
