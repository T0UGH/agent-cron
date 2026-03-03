# CLAUDE.md — agent-cron

## Project Overview

agent-cron is a cron scheduler for Claude Agent SDK tasks. Each task is a `.md` file with a YAML frontmatter header (name, cron expression, output channel) and a prompt body. The scheduler runs tasks on their cron schedule and sends output to the configured channel.

**Published as:** `@t0u9h/agent-cron` on npm
**Repo:** https://github.com/T0UGH/agent-cron

---

## Architecture

```
tasks/*.md  →  loader.ts  →  scheduler.ts  →  runner.ts  →  AgentRunner  →  OutputChannel
                                                               agents/         outputs/
```

Key files:

| File | Role |
|------|------|
| `src/cli.ts` | Entry point, argument parsing, dispatches to scheduler |
| `src/loader.ts` | Reads `tasks/*.md`, parses frontmatter via gray-matter |
| `src/runner.ts` | Runs one task: substitutes `{date}`, calls agent, checks HEARTBEAT_OK, sends to channel |
| `src/scheduler.ts` | `startScheduler` (cron loop), `runNow`, `listTasks` |
| `src/types.ts` | `Task`, `OutputChannel`, `AgentRunner` interfaces |
| `src/agents/index.ts` | Registry: `runners` map (name → AgentRunner) |
| `src/agents/claude.ts` | ClaudeRunner — calls `@anthropic-ai/claude-agent-sdk` |
| `src/outputs/index.ts` | Registry: `channels` map (name → OutputChannel) |
| `src/outputs/file.ts` | FileChannel — writes `{outputDir}/{slug}-{YYYY-MM-DD}.md` |
| `src/outputs/feishu.ts` | FeishuChannel — Markdown → Feishu rich text POST |
| `src/outputs/github.ts` | GithubChannel — creates/updates file via GitHub Contents API |

---

## Common Commands

```bash
# Development (runs TypeScript directly via tsx)
npm run dev               # equivalent of: node --import tsx/esm src/cli.ts
npm run list              # list tasks in ./tasks/
npm run start             # start scheduler with ./tasks/

# Testing
npm test                  # runs all tests in tests/**/*.test.ts

# Build
npm run build             # tsc → dist/

# Run after build
node dist/cli.js list
node dist/cli.js run <slug>
node dist/cli.js start ./tasks
```

---

## Adding a New Output Channel

1. Create `src/outputs/<name>.ts`:

```typescript
import type { OutputChannel } from '../types.js';
import type { Task } from '../types.js';

export class MyChannel implements OutputChannel {
  async send(result: string, task: Task): Promise<void> {
    // read channel config from task fields
    // e.g., task.myWebhook
    // send result somewhere
  }
}
```

2. Register in `src/outputs/index.ts`:

```typescript
import { MyChannel } from './my.js';

export const channels: Record<string, OutputChannel> = {
  file:   new FileChannel(),
  feishu: new FeishuChannel(),
  github: new GithubChannel(),
  my:     new MyChannel(),   // ← add here
};
```

3. Add a test in `tests/` (see existing tests for pattern).

---

## Adding a New Agent Runner

1. Create `src/agents/<name>.ts`:

```typescript
import type { AgentRunner } from '../types.js';
import type { Task } from '../types.js';

export class MyRunner implements AgentRunner {
  async run(prompt: string, task: Task): Promise<string> {
    // call your AI agent
    return result;
  }
}
```

2. Register in `src/agents/index.ts`:

```typescript
import { MyRunner } from './my.js';

export const runners: Record<string, AgentRunner> = {
  claude: new ClaudeRunner(),
  my:     new MyRunner(),   // ← add here
};
```

3. Tasks can then set `agent: my` in frontmatter.

---

## Testing

Tests use Node.js built-in `node:test` (no extra test framework). TypeScript is handled by `tsx`.

```bash
npm test
# runs: node --import tsx/esm --test tests/**/*.test.ts
```

Test files:

| File | What it tests |
|------|---------------|
| `tests/loader.test.ts` | Task file parsing, frontmatter validation, slug generation |
| `tests/runner.test.ts` | HEARTBEAT_OK handling, `{date}` substitution, agent/channel dispatch |
| `tests/scheduler.test.ts` | listTasks output, runNow (all / by slug), exit codes |
| `tests/feishu.test.ts` | `markdownToFeishuPost` — Markdown → Feishu block conversion |
| `tests/file-channel.test.ts` | FileChannel — output path, directory creation |

**Injecting fakes:** `runners` and `channels` are exported mutable objects. Override them per-test:

```typescript
import { runners } from '../src/agents/index.js';
import { channels } from '../src/outputs/index.js';

let capturedResult = '';
runners['claude'] = { run: async (prompt) => 'some result' };
channels['file']  = { send: async (result) => { capturedResult = result; } };
```

---

## Claude Code Skill

The skill lives in `skills/agent-cron/SKILL.md` and is distributed as a marketplace plugin via `.claude-plugin/`.

Install command for users:
```bash
/claude install marketplace https://github.com/T0UGH/agent-cron/raw/main/.claude-plugin/marketplace.json
```

The skill covers 4 branches:
- **create** — guided task creation + auto-configures macOS launchd if not set up
- **list** — runs `npx @t0u9h/agent-cron list`
- **run** — runs `npx @t0u9h/agent-cron run [slug]`
- **setup** — writes `~/Library/LaunchAgents/com.agent-cron.plist` and loads it

---

## Publishing

```bash
npm run build
npm publish --access public
```

Package name: `@t0u9h/agent-cron`
Requires npm token with publish access. The `files` field in `package.json` ensures only `dist/` is published (no source, no tests).

---

## Environment Variables

```
ANTHROPIC_API_KEY    required — passed to Claude Agent SDK
GITHUB_TOKEN         required for output: github
FEISHU_WEBHOOK       required for output: feishu (unless feishuWebhook set per-task)
```

A `.env` file in the working directory is loaded automatically via `dotenv/config` in `cli.ts`.

---

## Timezone

All cron expressions run in `Asia/Shanghai`. This is hardcoded in `scheduler.ts` via `node-cron`'s timezone option.

---

## HEARTBEAT_OK Protocol

If the agent's output (trimmed) equals exactly `HEARTBEAT_OK`, `runner.ts` skips the output step silently. Use this in task prompts to avoid noisy output when there's nothing new to report:

```
如果没有值得关注的新内容，直接输出：HEARTBEAT_OK
```
