# Design: Remove OutputChannel + Add Structured Logging

Date: 2026-03-07

## Problem

The OutputChannel abstraction (file, feishu, github) is unnecessary. Agents like Claude already have tools to write files, call webhooks, and interact with APIs. The framework shouldn't duplicate this — users should define output behavior directly in the task prompt.

Additionally, logging is currently minimal, making it hard to debug task failures or trace agent behavior.

## Decision

1. **Remove OutputChannel entirely.** Tasks no longer declare an `output` field. Agents handle all output themselves via their tools or prompt instructions.
2. **Add structured per-task logging** so every run is observable without needing the agent to report back.

## What Changes

### Deleted
- `src/outputs/` directory (file.ts, feishu.ts, github.ts, index.ts)
- `OutputChannel` interface from `src/types.ts`
- `Task.output` field from `src/types.ts`
- Channel dispatch logic from `src/runner.ts`

### Kept
- `ClaudeRunner`, `ShellRunner`
- `HEARTBEAT_OK` protocol
- `Task.skills` field and selective skill loading

### New: Log System

**Location:** `~/.agent-cron/logs/<task-slug>/YYYY-MM-DD.log`

**Log events per run:**

```
[2026-03-07 08:00:00.123] [START] task=daily-ai-news
[2026-03-07 08:00:01.456] [TOOL]  name=web_search input={"query":"AI news today"}
[2026-03-07 08:00:02.789] [TOOL]  name=web_search output="..."
[2026-03-07 08:00:10.000] [END]   status=ok duration=9877ms
```

On failure:
```
[2026-03-07 08:00:10.000] [END]   status=error duration=9877ms error="..."
```

If HEARTBEAT_OK:
```
[2026-03-07 08:00:10.000] [END]   status=heartbeat duration=9877ms
```

**Format rules:**
- One line per event
- ISO timestamp prefix
- Append-only, one file per task per day
- Directory created on first write
- Tool output truncated to 500 chars to keep logs readable

## Task Frontmatter After Change

```yaml
---
name: Daily AI News
cron: "0 8 * * *"
agent: claude        # optional, default claude
skills: true         # optional
---
Your prompt here. Output wherever you want.
```

`output` field removed. Existing tasks with `output` field will have it ignored (unknown fields pass through via `[key: string]: unknown`).

## Testing

- Remove `tests/file-channel.test.ts` and `tests/feishu.test.ts`
- Update `tests/runner.test.ts` to remove channel injection
- Add `tests/logger.test.ts`: verify log file path, format, HEARTBEAT_OK status, error status
