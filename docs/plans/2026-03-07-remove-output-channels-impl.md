# Remove OutputChannel + Add Structured Logging — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the OutputChannel abstraction entirely and add structured per-task logging to `~/.agent-cron/logs/<slug>/YYYY-MM-DD.log`.

**Architecture:** Tasks no longer declare an `output` field — agents handle all output themselves. A new `Logger` class writes timestamped events (START, TOOL, END) to per-task log files. `runner.ts` is simplified: call agent, log result, done.

**Tech Stack:** TypeScript, Node.js `fs`, `os`, `path` (all built-in — no new deps)

---

### Task 1: Add Logger class

**Files:**
- Create: `src/logger.ts`
- Test: `tests/logger.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/logger.test.ts
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Override home dir to a temp dir for testing
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-test-'));
const origHome = os.homedir;
(os as any).homedir = () => tmpHome;

import { Logger } from '../src/logger.js';

after(() => {
  (os as any).homedir = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('Logger', () => {
  test('creates log file at correct path', () => {
    const logger = new Logger('my-task');
    logger.start();
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'my-task', `${today}.log`);
    assert.ok(fs.existsSync(logPath), `expected log file at ${logPath}`);
  });

  test('log file contains START entry', () => {
    const logger = new Logger('task-start');
    logger.start();
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-start', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('[START]'), 'expected [START] in log');
  });

  test('end logs status=ok with duration', () => {
    const logger = new Logger('task-end-ok');
    logger.start();
    logger.end('ok');
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-end-ok', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('[END]') && content.includes('status=ok'), 'expected [END] status=ok');
    assert.ok(content.includes('duration='), 'expected duration in END log');
  });

  test('end logs status=error with error message', () => {
    const logger = new Logger('task-end-err');
    logger.start();
    logger.end('error', 'something went wrong');
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-end-err', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('status=error') && content.includes('something went wrong'));
  });

  test('end logs status=heartbeat', () => {
    const logger = new Logger('task-heartbeat');
    logger.start();
    logger.end('heartbeat');
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-heartbeat', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('status=heartbeat'));
  });

  test('tool logs name, input, output truncated to 500 chars', () => {
    const logger = new Logger('task-tool');
    logger.start();
    logger.tool('web_search', { query: 'AI news' }, 'a'.repeat(600));
    const today = new Date().toISOString().slice(0, 10);
    const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-tool', `${today}.log`);
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('[TOOL]') && content.includes('web_search'));
    // output truncated — should not contain 600 'a's
    assert.ok(!content.includes('a'.repeat(501)), 'output should be truncated to 500 chars');
  });
});
```

**Step 2: Run to confirm it fails**

```bash
cd /Users/haha/workspace/github/agent-cron
npm test -- --test-name-pattern "Logger" 2>&1 | head -30
```

Expected: error — `src/logger.ts` not found

**Step 3: Write minimal implementation**

```typescript
// src/logger.ts
import fs from 'fs';
import path from 'path';
import os from 'os';

export class Logger {
  private slug: string;
  private startTime: number = 0;

  constructor(slug: string) {
    this.slug = slug;
  }

  private logPath(): string {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(os.homedir(), '.agent-cron', 'logs', this.slug, `${today}.log`);
  }

  private write(line: string): void {
    const filePath = this.logPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    fs.appendFileSync(filePath, `[${ts}] ${line}\n`, 'utf-8');
  }

  start(): void {
    this.startTime = Date.now();
    this.write(`[START] task=${this.slug}`);
  }

  end(status: 'ok' | 'error' | 'heartbeat', error?: string): void {
    const duration = Date.now() - this.startTime;
    const errPart = error ? ` error="${error}"` : '';
    this.write(`[END]   status=${status} duration=${duration}ms${errPart}`);
  }

  tool(name: string, input: unknown, output?: unknown): void {
    const inputStr = JSON.stringify(input);
    const outputStr = output !== undefined
      ? String(typeof output === 'string' ? output : JSON.stringify(output)).slice(0, 500)
      : '';
    this.write(`[TOOL]  name=${name} input=${inputStr}${outputStr ? ` output=${outputStr}` : ''}`);
  }
}
```

**Step 4: Run tests to confirm they pass**

```bash
npm test -- --test-name-pattern "Logger" 2>&1 | tail -20
```

Expected: all Logger tests pass

**Step 5: Commit**

```bash
git add src/logger.ts tests/logger.test.ts
git commit -m "feat: add Logger class for per-task structured logging"
```

---

### Task 2: Wire Logger into ClaudeRunner for tool call logging

**Files:**
- Modify: `src/agents/claude.ts`
- Modify: `src/types.ts` (add optional `logger` param, or pass via constructor)

The cleanest approach: pass a `Logger` instance into `AgentRunner.run()` as an optional 3rd arg. The SDK's `query()` async iterator yields messages with `type === 'tool_use'` and `type === 'tool_result'` — log those.

**Step 1: Update AgentRunner interface in types.ts**

In `src/types.ts`, change:
```typescript
export interface AgentRunner {
  run(prompt: string, task: Task): Promise<string>
}
```
To:
```typescript
import type { Logger } from './logger.js';

export interface AgentRunner {
  run(prompt: string, task: Task, logger?: Logger): Promise<string>
}
```

**Step 2: Run existing tests to confirm still passing**

```bash
npm test 2>&1 | tail -20
```

Expected: all pass (interface change is backward compatible — `logger` is optional)

**Step 3: Update ClaudeRunner to accept and use logger**

In `src/agents/claude.ts`, change the `run` signature and add tool logging inside the message loop:

```typescript
import type { Logger } from '../logger.js';

export class ClaudeRunner implements AgentRunner {
  async run(prompt: string, task: Task, logger?: Logger): Promise<string> {
    // ... existing setup code unchanged ...

    try {
      const q = query({ prompt, options: { ... } }); // unchanged

      for await (const message of q) {
        if (message.type === 'tool_use') {
          logger?.tool(message.name, message.input);
        }
        if (message.type === 'tool_result') {
          // find last tool_use name via message.tool_use_id — log output only
          const outputText = Array.isArray(message.content)
            ? message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
            : String(message.content ?? '');
          logger?.tool('(result)', { id: message.tool_use_id }, outputText);
        }
        if (message.type === 'result' && 'result' in message && message.result) {
          result = message.result;
        }
      }
    } finally {
      // ... existing cleanup unchanged ...
    }

    return result;
  }
}
```

**Step 4: Run tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all pass

**Step 5: Commit**

```bash
git add src/types.ts src/agents/claude.ts
git commit -m "feat: pass Logger to AgentRunner for tool call logging"
```

---

### Task 3: Simplify runner.ts — remove channel dispatch, add logger

**Files:**
- Modify: `src/runner.ts`
- Modify: `tests/runner.test.ts`

**Step 1: Rewrite runner.ts**

```typescript
// src/runner.ts
import type { Task } from './types.js';
import { runners } from './agents/index.js';
import { Logger } from './logger.js';

function buildPrompt(template: string): string {
  const date = new Date().toLocaleDateString('zh-CN');
  return template.replace(/\{date\}/g, date);
}

export async function runTask(task: Task): Promise<void> {
  const logger = new Logger(task.slug);
  logger.start();

  const agentName = String(task.agent ?? 'claude');
  const agentRunner = runners[agentName];
  if (!agentRunner) {
    const msg = `unknown agent: "${agentName}"`;
    console.error(`[agent-cron] ${msg} (${task.name})`);
    logger.end('error', msg);
    return;
  }

  const prompt = buildPrompt(task.prompt);

  try {
    const result = await agentRunner.run(prompt, task, logger);

    if (!result) {
      const msg = 'no result returned';
      console.error(`[agent-cron] ${msg} (${task.name})`);
      logger.end('error', msg);
      return;
    }

    if (result.trim() === 'HEARTBEAT_OK') {
      console.log(`[agent-cron] OK — no new content (${task.name})`);
      logger.end('heartbeat');
      return;
    }

    console.log(`[agent-cron] done: ${task.name}`);
    logger.end('ok');
  } catch (err: any) {
    console.error(`[agent-cron] agent error (${task.name}):`, err);
    logger.end('error', err?.message ?? String(err));
  }
}
```

**Step 2: Rewrite tests/runner.test.ts**

Remove all channel references. The `makeTask` helper no longer needs `output`. Tests verify log behavior via the Logger (or just via console messages — keep it simple, don't test log files in runner tests).

```typescript
// tests/runner.test.ts
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runners } from '../src/agents/index.js';
import { runTask } from '../src/runner.js';
import type { Task, AgentRunner } from '../src/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    slug: 'test-task',
    name: 'Test Task',
    cron: '0 9 * * *',
    prompt: 'test prompt',
    ...overrides,
  };
}

function captureConsole(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const origError = console.error.bind(console);
  const origLog = console.log.bind(console);
  console.error = (...args: unknown[]) => messages.push(String(args[0]));
  console.log = (...args: unknown[]) => messages.push(String(args[0]));
  return { messages, restore() { console.error = origError; console.log = origLog; } };
}

describe('runTask', () => {
  const originalRunners = { ...runners };

  beforeEach(() => {
    Object.keys(runners).forEach((k) => delete (runners as Record<string, unknown>)[k]);
    Object.assign(runners, originalRunners);
  });

  test('HEARTBEAT_OK logs no new content', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return 'HEARTBEAT_OK'; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('no new content')));
  });

  test('HEARTBEAT_OK with whitespace is treated as HEARTBEAT_OK', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return '  HEARTBEAT_OK  \n'; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('no new content')));
  });

  test('successful result logs done', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return '# Content'; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('done')));
  });

  test('unknown agent logs error', async () => {
    const cap = captureConsole();
    await runTask(makeTask({ agent: 'nonexistent-agent' }));
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('unknown agent') && m.includes('nonexistent-agent')));
  });

  test('empty result logs error', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { return ''; } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('no result returned')));
  });

  test('agent throw logs error and does not rethrow', async () => {
    (runners as Record<string, AgentRunner>)['claude'] = { async run() { throw new Error('SDK error'); } };
    const cap = captureConsole();
    await runTask(makeTask());
    cap.restore();
    assert.ok(cap.messages.some((m) => m.includes('agent error')));
  });

  test('substitutes {date} in prompt', async () => {
    let receivedPrompt = '';
    (runners as Record<string, AgentRunner>)['claude'] = { async run(prompt) { receivedPrompt = prompt; return 'HEARTBEAT_OK'; } };
    const cap = captureConsole();
    await runTask(makeTask({ prompt: 'Today is {date}.' }));
    cap.restore();
    assert.ok(!receivedPrompt.includes('{date}'));
    assert.match(receivedPrompt, /Today is \d{4}\/\d+\/\d+\./);
  });
});
```

**Step 3: Run all tests**

```bash
npm test 2>&1 | tail -30
```

Expected: all pass, no channel-related tests

**Step 4: Commit**

```bash
git add src/runner.ts tests/runner.test.ts
git commit -m "refactor: remove OutputChannel dispatch from runner, wire Logger"
```

---

### Task 4: Remove OutputChannel — types, outputs dir, dead tests

**Files:**
- Modify: `src/types.ts` — remove `OutputChannel` interface, remove `output` field from `Task`
- Delete: `src/outputs/` directory
- Delete: `tests/file-channel.test.ts`
- Delete: `tests/feishu.test.ts`

**Step 1: Update src/types.ts**

Remove `output: string` from `Task` and remove the `OutputChannel` interface. Final file:

```typescript
// src/types.ts
import type { Logger } from './logger.js';

export interface Task {
  slug: string
  name: string
  cron: string
  agent?: string
  skills?: boolean | string[]
  prompt: string
  [key: string]: unknown
}

export interface AgentRunner {
  run(prompt: string, task: Task, logger?: Logger): Promise<string>
}
```

**Step 2: Delete outputs directory and dead test files**

```bash
rm -rf src/outputs
rm -f tests/file-channel.test.ts tests/feishu.test.ts
```

**Step 3: Run all tests**

```bash
npm test 2>&1 | tail -30
```

Expected: all pass, no import errors

**Step 4: Build to verify no TypeScript errors**

```bash
npm run build 2>&1
```

Expected: clean build, no errors

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove OutputChannel abstraction, delete outputs/ dir and dead tests"
```

---

### Task 5: Update task files and CLAUDE.md

**Files:**
- Modify: `tasks/daily-ai-news.md` — remove `output:` frontmatter line
- Modify: `tasks/github-ai-projects.md` — remove `output:` frontmatter line
- Modify: `CLAUDE.md` — update architecture, remove output channel docs, add logger docs

**Step 1: Remove `output:` from task files**

Check each task file with `grep -n "^output:" tasks/*.md` and remove those lines.

**Step 2: Update CLAUDE.md**

- Update architecture diagram: remove `OutputChannel` box and `outputs/` from key files table
- Add `src/logger.ts` to key files table
- Replace "Adding a New Output Channel" section with "Log Files" section describing `~/.agent-cron/logs/<slug>/YYYY-MM-DD.log` format
- Update env vars section: remove `FEISHU_WEBHOOK`, `GITHUB_TOKEN`

**Step 3: Commit**

```bash
git add tasks/ CLAUDE.md
git commit -m "docs: update task files and CLAUDE.md to reflect removed OutputChannel"
```

---

### Task 6: Final check

```bash
npm test && npm run build
```

Expected: all tests pass, clean build.

If clean:
```bash
git log --oneline -8
```

Done.
