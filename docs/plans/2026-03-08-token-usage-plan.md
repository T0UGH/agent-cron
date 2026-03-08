# Token Usage Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track per-task token usage (cost, input/output tokens) from the Claude Agent SDK and surface it in logs and the markdown dashboard.

**Architecture:** `ClaudeRunner.run()` returns a `RunResult` object with usage data. `runner.ts` normalizes the return value and passes usage to `Logger.end()`, which appends `cost=X in=Y out=Z` to the `[END]` log line. `dashboard.ts` parses these fields and adds a Cost column to the status table.

**Tech Stack:** TypeScript, node:test, @anthropic-ai/claude-agent-sdk (existing)

---

### Task 1: Add RunResult type and update AgentRunner interface

**Files:**
- Modify: `src/types.ts`

**Step 1: Write the failing test**

No test needed — this is a type-only change. Existing tests will verify backward compatibility after modifying runner.ts in Task 3.

**Step 1: Update types.ts**

In `src/types.ts`, add `RunResult` and update `AgentRunner.run()` return type:

```typescript
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

export interface RunResult {
  result: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AgentRunner {
  run(prompt: string, task: Task, logger?: Logger): Promise<string | RunResult>
}
```

**Step 2: Run all tests to verify nothing breaks**

Run: `npm test`
Expected: All PASS (type change is backward-compatible)

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add RunResult type to AgentRunner interface"
```

---

### Task 2: Add usage parameter to Logger.end()

**Files:**
- Modify: `src/logger.ts`
- Modify: `tests/logger.test.ts`

**Step 1: Write the failing test**

Add to `tests/logger.test.ts`, inside the `describe('Logger', ...)` block:

```typescript
test('end logs usage fields when provided', () => {
  const logger = new Logger('task-usage');
  logger.start();
  logger.end('ok', undefined, { cost: 0.0123, inputTokens: 1500, outputTokens: 800 });
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-usage', `${today}.log`);
  const content = fs.readFileSync(logPath, 'utf-8');
  assert.ok(content.includes('cost=0.0123'), 'expected cost in END log');
  assert.ok(content.includes('in=1500'), 'expected input tokens in END log');
  assert.ok(content.includes('out=800'), 'expected output tokens in END log');
});

test('end omits usage fields when not provided', () => {
  const logger = new Logger('task-no-usage');
  logger.start();
  logger.end('ok');
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(tmpHome, '.agent-cron', 'logs', 'task-no-usage', `${today}.log`);
  const content = fs.readFileSync(logPath, 'utf-8');
  assert.ok(!content.includes('cost='), 'should not have cost when no usage');
});
```

**Step 2: Run tests to verify the first test fails**

Run: `npm test -- --test-name-pattern "end logs usage fields"`
Expected: FAIL — `logger.end()` doesn't accept a third argument yet

**Step 3: Update Logger.end() to accept usage**

In `src/logger.ts`, change the `end` method signature and body:

```typescript
end(status: 'ok' | 'error' | 'heartbeat', error?: string, usage?: { cost?: number; inputTokens?: number; outputTokens?: number }): void {
  const duration = this.startTime > 0 ? `${Date.now() - this.startTime}ms` : 'unknown';
  const errPart = error ? ` error="${error}"` : '';
  let usagePart = '';
  if (usage) {
    if (usage.cost !== undefined) usagePart += ` cost=${usage.cost}`;
    if (usage.inputTokens !== undefined) usagePart += ` in=${usage.inputTokens}`;
    if (usage.outputTokens !== undefined) usagePart += ` out=${usage.outputTokens}`;
  }
  this.write(`[END]   status=${status} duration=${duration}${errPart}${usagePart}`);
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern "end logs usage|end omits usage"`
Expected: Both PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: All PASS (existing tests call `end()` without usage — still works)

**Step 6: Commit**

```bash
git add src/logger.ts tests/logger.test.ts
git commit -m "feat: add usage tracking to Logger.end()"
```

---

### Task 3: Update runner.ts to handle RunResult

**Files:**
- Modify: `src/runner.ts`
- Modify: `tests/runner.test.ts`

**Step 1: Write the failing test**

Add to `tests/runner.test.ts`, inside the `describe('runTask', ...)` block:

```typescript
test('passes usage from RunResult to logger', async () => {
  (runners as Record<string, AgentRunner>)['claude'] = {
    async run() {
      return { result: '# Content', cost: 0.05, inputTokens: 2000, outputTokens: 500 };
    },
  };
  const cap = captureConsole();
  await runTask(makeTask());
  cap.restore();
  assert.ok(cap.messages.some((m) => m.includes('done')));

  // Verify usage was written to log
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(os.homedir(), '.agent-cron', 'logs', 'test-task', `${today}.log`);
  const content = fs.readFileSync(logPath, 'utf-8');
  assert.ok(content.includes('cost=0.05'), 'expected cost in log');
  assert.ok(content.includes('in=2000'), 'expected input tokens in log');
  assert.ok(content.includes('out=500'), 'expected output tokens in log');
});
```

Also add these imports at the top of `tests/runner.test.ts` (if not already present):

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "passes usage from RunResult"`
Expected: FAIL — `runner.ts` treats return value as string, doesn't extract usage

**Step 3: Update runner.ts to normalize RunResult**

Replace the `runTask` function in `src/runner.ts`:

```typescript
import type { Task, RunResult } from './types.js';
import { runners } from './agents/index.js';
import { Logger } from './logger.js';

function buildPrompt(template: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return template.replace(/\{date\}/g, date);
}

function normalizeResult(raw: string | RunResult): { result: string; usage?: { cost?: number; inputTokens?: number; outputTokens?: number } } {
  if (typeof raw === 'string') return { result: raw };
  return {
    result: raw.result,
    usage: (raw.cost !== undefined || raw.inputTokens !== undefined || raw.outputTokens !== undefined)
      ? { cost: raw.cost, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }
      : undefined,
  };
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
    const raw = await agentRunner.run(prompt, task, logger);
    const { result, usage } = normalizeResult(raw);

    if (!result) {
      const msg = 'no result returned';
      console.error(`[agent-cron] ${msg} (${task.name})`);
      logger.end('error', msg, usage);
      return;
    }

    if (result.trim() === 'HEARTBEAT_OK') {
      console.log(`[agent-cron] OK — no new content (${task.name})`);
      logger.end('heartbeat', undefined, usage);
      return;
    }

    console.log(`[agent-cron] done: ${task.name}`);
    logger.end('ok', undefined, usage);
  } catch (err: any) {
    console.error(`[agent-cron] agent error (${task.name}):`, err);
    logger.end('error', err?.message ?? String(err));
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern "passes usage from RunResult"`
Expected: PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: All PASS (existing tests return plain strings — still works via `normalizeResult`)

**Step 6: Commit**

```bash
git add src/runner.ts tests/runner.test.ts
git commit -m "feat: pass token usage from AgentRunner to Logger"
```

---

### Task 4: Update ClaudeRunner to return RunResult

**Files:**
- Modify: `src/agents/claude.ts`

**Step 1: Update ClaudeRunner.run() to extract usage from SDK result**

No unit test for this task — it touches the real SDK. Verified via integration/smoke test.

In `src/agents/claude.ts`, change the `run` method to return `RunResult`:

```typescript
import type { AgentRunner, Task, RunResult } from '../types.js';
```

Change the method signature and body. Replace lines 37-85 (the `run` method):

```typescript
async run(prompt: string, task: Task, logger?: Logger): Promise<RunResult> {
  const loadSkills = task.skills !== false;
  const skillNames = Array.isArray(task.skills) ? task.skills as string[] : [];
  let result = '';
  let cost: number | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let tmpPluginDir: string | null = null;

  const plugins: { type: 'local'; path: string }[] = [];

  if (skillNames.length > 0) {
    tmpPluginDir = buildSkillPlugin(skillNames);
    if (tmpPluginDir) {
      plugins.push({ type: 'local', path: tmpPluginDir });
    }
  }

  try {
    const q = query({
      prompt,
      options: {
        cwd: process.cwd(),
        permissionMode: 'bypassPermissions',
        ...(loadSkills && skillNames.length === 0 ? { settingSources: ['user'] } : {}),
        ...(plugins.length > 0 ? { plugins } : {}),
      },
    });

    for await (const message of q) {
      const msg = message as any;
      if (msg.type === 'tool_use') {
        logger?.tool(String(msg.name ?? ''), msg.input);
      }
      if (msg.type === 'tool_result') {
        const outputText = Array.isArray(msg.content)
          ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
          : String(msg.content ?? '');
        logger?.tool('(result)', { id: msg.tool_use_id }, outputText);
      }
      if (message.type === 'result') {
        if ('result' in message && message.result) {
          result = message.result;
        }
        if ('total_cost_usd' in msg) {
          cost = msg.total_cost_usd;
        }
        if ('usage' in msg && msg.usage) {
          inputTokens = msg.usage.input_tokens;
          outputTokens = msg.usage.output_tokens;
        }
      }
    }
  } finally {
    if (tmpPluginDir) {
      fs.rmSync(tmpPluginDir, { recursive: true, force: true });
    }
  }

  return { result, cost, inputTokens, outputTokens };
}
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 3: Build**

Run: `npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/agents/claude.ts
git commit -m "feat: extract token usage from Claude Agent SDK result"
```

---

### Task 5: Add Cost column to dashboard

**Files:**
- Modify: `src/dashboard.ts`
- Modify: `tests/dashboard.test.ts`

**Step 1: Write the failing test**

Add to `tests/dashboard.test.ts`, inside the `describe('generateMarkdown', ...)` block:

```typescript
test('shows cost column from log usage data', () => {
  writeLog('cost-task', today,
    `[${today} 10:00:01.000] [START] task=cost-task\n` +
    `[${today} 10:00:11.000] [END]   status=ok duration=10000ms cost=0.0456 in=3000 out=1200\n`
  );
  const md = generateMarkdown(makeTasks(['cost-task']));
  assert.ok(md.includes('Cost'), 'expected Cost column header');
  assert.ok(md.includes('$0.0456'), 'expected cost value with $ prefix');
});

test('shows "-" for cost when log has no usage data', () => {
  writeLog('no-cost-task', today,
    `[${today} 10:00:01.000] [START] task=no-cost-task\n` +
    `[${today} 10:00:11.000] [END]   status=ok duration=10000ms\n`
  );
  const md = generateMarkdown(makeTasks(['no-cost-task']));
  assert.ok(md.includes('Cost'), 'expected Cost column header');
  // The row for no-cost-task should have "-" in the cost column
  const lines = md.split('\n');
  const row = lines.find(l => l.includes('no-cost-task'));
  assert.ok(row, 'expected a row for no-cost-task');
  assert.ok(row!.includes('| - |'), 'expected "-" for missing cost');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern "shows cost column|shows .* for cost"`
Expected: FAIL — dashboard doesn't have a Cost column yet

**Step 3: Update dashboard.ts to parse cost and add column**

In `src/dashboard.ts`, update `parseLastEnd` to also extract cost:

Change the return type and add cost parsing. The current `parseLastEnd` function returns `{ status, duration, time }`. Update it to also return `cost`:

```typescript
function parseLastEnd(logFile: string): { status: string; duration: string; time: string; cost: string | null } | null {
  let content: string;
  try {
    content = fs.readFileSync(logFile, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  let lastEnd: string | null = null;
  for (const line of lines) {
    if (line.includes('[END]')) lastEnd = line;
  }
  if (!lastEnd) return null;

  const tsMatch = lastEnd.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  const statusMatch = lastEnd.match(/status=(\w+)/);
  const durationMatch = lastEnd.match(/duration=(\S+)/);
  const costMatch = lastEnd.match(/cost=(\S+)/);

  if (!statusMatch) return null;

  return {
    status: statusMatch[1],
    duration: durationMatch?.[1] ?? '?',
    time: tsMatch?.[1] ?? '',
    cost: costMatch?.[1] ?? null,
  };
}
```

Then update `generateMarkdown` to add the Cost column. Change the table header:

```typescript
lines.push('| Task | Status | Last Run | Duration | Cost |');
lines.push('|------|--------|----------|----------|------|');
```

Update each row in the for loop. For the "never" case:

```typescript
lines.push(`| ${task.slug} | never | - | - | - |`);
```

For the "running?" case:

```typescript
lines.push(`| ${task.slug} | running? | ${latest.date} | - | - |`);
```

For the normal case, format cost with `$` prefix:

```typescript
const costStr = parsed.cost ? `$${parsed.cost}` : '-';
lines.push(`| ${task.slug} | ${parsed.status} | ${hhmm} | ${durationSec} | ${costStr} |`);
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern "shows cost column|shows .* for cost"`
Expected: Both PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/dashboard.ts tests/dashboard.test.ts
git commit -m "feat: add Cost column to markdown dashboard"
```

---

### Task 6: Build, verify, and final commit

**Step 1: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 2: Build**

Run: `npm run build`
Expected: No errors

**Step 3: Manual verification**

Check the generated log format by looking at existing logs:
```bash
ls ~/.agent-cron/logs/
```

The next cron run of a Claude task will produce a log line like:
```
[2026-03-08 23:30:11.000] [END]   status=ok duration=15000ms cost=0.0456 in=3000 out=1200
```

And `agent-cron dashboard` will show:
```
| Task | Status | Last Run | Duration | Cost |
|------|--------|----------|----------|------|
| ai-news-agent-reach | ok | 23:30 | 15s | $0.0456 |
```
