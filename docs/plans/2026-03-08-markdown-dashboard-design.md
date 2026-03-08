# Markdown Dashboard — Design

## Problem

User has no easy way to check task run status without SSH-ing into the Mac mini and running `agent-cron status`. Wants to see status from phone/anywhere.

## Solution

After all queued tasks finish, generate `~/workspace/memory/agent-cron-status.md` and git push. Viewable on GitHub from any device.

## Content

- Updated timestamp
- Table: task name, status (ok/heartbeat/error/never), last run time, duration
- 7-day history summary: date, ok count, heartbeat count, error count

## Trigger

Queue `onEmpty` callback — fires once when all queued tasks complete. Avoids multiple git pushes when tasks run back-to-back.

## Changes

| File | Change |
|------|--------|
| New `src/dashboard.ts` | `generateDashboard(tasks)` — reads logs, writes markdown, git push |
| `src/queue.ts` | Add `onEmpty` callback support |
| `src/scheduler.ts` | Register onEmpty callback to generate dashboard |

## Git Push

Uses `child_process.execSync` to run git commands in `~/workspace/memory`:
```bash
git add agent-cron-status.md
git commit -m "chore: update agent-cron status"
git push
```
Silently swallows git errors (network down, nothing to commit, etc).
