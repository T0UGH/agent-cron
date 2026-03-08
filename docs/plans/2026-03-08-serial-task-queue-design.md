# Serial Task Queue — Design

## Problem

When multiple tasks share the same cron time, `scheduler.ts` fires them concurrently via `void runTask(task)`. This causes silent failures (e.g. github-ai-projects never ran). Current workaround: stagger cron times manually.

## Goal

Add a global serial task queue so tasks execute one at a time, in deterministic order, with observable status.

## Rules

1. **Serial execution** — global queue, one task running at a time
2. **Filename sort** — tasks triggered in the same tick are sorted by slug (alphabetical)
3. **Dedup** — if a slug is already queued or running, skip the new trigger
4. **Observable** — `status` command shows `running` / `queued` real-time state

## Architecture

```
cron trigger → queue.enqueue(task) → queue serial consumer → runTask(task)
```

New file `src/queue.ts` contains `TaskQueue` class:
- `enqueue(task)` — add to queue (dedup + sort same-tick entries)
- Internal async loop consumes one task at a time
- Exposes `getState()` for status command: which task is running, which are queued

## Changes

| File | Change |
|------|--------|
| New `src/queue.ts` | TaskQueue class |
| `src/scheduler.ts` | Replace `void runTask(task)` with `queue.enqueue(task)` |
| `src/status.ts` | Show running/queued from queue state |
| `src/types.ts` | Queue-related types if needed |

## Status Display

```
TASK                       LAST RUN       STATUS      DURATION
--------------------------------------------------------------
ai-news-agent-reach        → running      -           -
github-ai-projects         → queued (#2)  -           -
claude-code-changelog      今天 00:00     ok          45s
```

Running tasks show `→ running`, queued tasks show `→ queued (#N)`, completed tasks show log-based status as before.
