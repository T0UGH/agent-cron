# Task Timeout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable per-task timeout with a 10-minute default, enforced via AbortController in runner.ts.

**Architecture:** `runner.ts` creates an `AbortController` with `setTimeout`, passes the `signal` to `AgentRunner.run()`. Each runner wires the signal into its underlying mechanism (SDK `abortController` option for Claude, `signal` option for shell `exec`). On timeout, the abort error is caught and logged as `status=error error="timeout after Xm"`.

**Tech Stack:** TypeScript, node:test, AbortController (built-in), no new dependencies

---

### Task 1: Add signal parameter to AgentRunner interface

**Files:**
- Modify: `src/types.ts`

**Step 1: Update AgentRunner interface**

In `src/types.ts`, add `signal` as the 4th optional parameter:

```typescript
export interface AgentRunner {
  run(prompt: string, task: Task, logger?: Logger, signal?: AbortSignal): Promise<string | RunResult>
}
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All PASS (backward-compatible — new param is optional)

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add signal parameter to AgentRunner interface"
```

---

### Task 2: Add timeout logic to runner.ts

**Files:**
- Modify: `src/runner.ts`
- Modify: `tests/runner.test.ts`

**Step 1: Write the failing test**

Add to `tests/runner.test.ts`, inside the `describe('runTask', ...)` block:

```typescript
test('times out and logs error when task exceeds timeout', async () => {
  (runners as Record<string, AgentRunner>)['claude'] = {
    async run(_prompt, _task, _logger, signal) {
      // Simulate a long-running task that respects abort signal
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve('done'), 60000);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    },
  };
  const cap = captureConsole();
  await runTask(makeTask({ timeout: 0.01 })); // 0.01 minutes = 600ms
  cap.restore();
  assert.ok(cap.messages.some((m) => m.includes('timeout')));

  // Verify timeout error was logged
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(os.homedir(), '.agent-cron', 'logs', 'test-task', `${today}.log`);
  const content = fs.readFileSync(logPath, 'utf-8');
  assert.ok(content.includes('status=error'), 'expected error status');
  assert.ok(content.includes('timeout'), 'expected timeout in error message');
});

test('does not timeout when task completes within limit', async () => {
  (runners as Record<string, AgentRunner>)['claude'] = {
    async run() { return 'HEARTBEAT_OK'; },
  };
  const cap = captureConsole();
  await runTask(makeTask({ timeout: 1 })); // 1 minute — task finishes instantly
  cap.restore();
  assert.ok(cap.messages.some((m) => m.includes('no new content')));
  assert.ok(!cap.messages.some((m) => m.includes('timeout')));
});

test('no timeout when timeout is 0', async () => {
  (runners as Record<string, AgentRunner>)['claude'] = {
    async run() { return 'HEARTBEAT_OK'; },
  };
  const cap = captureConsole();
  await runTask(makeTask({ timeout: 0 }));
  cap.restore();
  assert.ok(cap.messages.some((m) => m.includes('no new content')));
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern "times out and logs"`
Expected: FAIL — runner.ts doesn't handle timeout yet

**Step 3: Update runner.ts with timeout logic**

Replace the full content of `src/runner.ts`:

```typescript
import type { Task, RunResult } from './types.js';
import { runners } from './agents/index.js';
import { Logger } from './logger.js';

const DEFAULT_TIMEOUT_MINUTES = 10;

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

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message === 'aborted');
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
  const timeoutMinutes = typeof task.timeout === 'number' ? task.timeout : DEFAULT_TIMEOUT_MINUTES;

  const ac = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMinutes > 0) {
    timeoutId = setTimeout(() => ac.abort(), timeoutMinutes * 60 * 1000);
  }

  try {
    const raw = await agentRunner.run(prompt, task, logger, ac.signal);
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
    if (isAbortError(err)) {
      const msg = `timeout after ${timeoutMinutes}m`;
      console.error(`[agent-cron] ${msg} (${task.name})`);
      logger.end('error', msg);
    } else {
      console.error(`[agent-cron] agent error (${task.name}):`, err);
      logger.end('error', err?.message ?? String(err));
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
```

**Step 4: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/runner.ts tests/runner.test.ts
git commit -m "feat: add task timeout support to runner"
```

---

### Task 3: Wire signal into ClaudeRunner

**Files:**
- Modify: `src/agents/claude.ts`

**Step 1: Update ClaudeRunner.run() to accept and use signal**

In `src/agents/claude.ts`, change the `run` method signature to accept `signal`:

```typescript
async run(prompt: string, task: Task, logger?: Logger, signal?: AbortSignal): Promise<RunResult> {
```

Create a linked AbortController from the signal and pass it to the SDK. Add this before the `query()` call, inside the `try` block:

```typescript
// Link external signal to a local AbortController for the SDK
const sdkAbortController = new AbortController();
if (signal) {
  signal.addEventListener('abort', () => sdkAbortController.abort(), { once: true });
}
```

Then pass `abortController: sdkAbortController` to the `query()` options:

```typescript
const q = query({
  prompt,
  options: {
    cwd: process.cwd(),
    permissionMode: 'bypassPermissions',
    abortController: sdkAbortController,
    ...(loadSkills && skillNames.length === 0 ? { settingSources: ['user'] } : {}),
    ...(plugins.length > 0 ? { plugins } : {}),
  },
});
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
git commit -m "feat: wire abort signal into ClaudeRunner SDK query"
```

---

### Task 4: Wire signal into ShellRunner

**Files:**
- Modify: `src/agents/shell.ts`

**Step 1: Update ShellRunner.run() to accept and use signal**

In `src/agents/shell.ts`, change the `run` method signature:

```typescript
async run(prompt: string, task: Task, logger?: Logger, signal?: AbortSignal): Promise<string> {
```

Replace the `execAsync` call options to use `signal` instead of the hardcoded `timeout`:

```typescript
const { stdout, stderr } = await execAsync(command, {
  cwd: process.cwd(),
  env: { ...process.env },
  signal,
});
```

Remove the hardcoded `timeout: 120000` — timeout is now controlled by runner.ts.

**Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 3: Build**

Run: `npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/agents/shell.ts
git commit -m "feat: wire abort signal into ShellRunner, remove hardcoded timeout"
```

---

### Task 5: Final build and verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 2: Build**

Run: `npm run build`
Expected: No errors
