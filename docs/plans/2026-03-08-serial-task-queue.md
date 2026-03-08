# Serial Task Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global serial task queue so cron-triggered tasks execute one at a time in deterministic order, with deduplication and observable status.

**Architecture:** New `TaskQueue` class in `src/queue.ts` sits between scheduler and runner. Scheduler enqueues tasks instead of calling `runTask()` directly. Queue processes one task at a time, sorted by slug. `status` command reads live queue state in addition to log history.

**Tech Stack:** TypeScript, node:test, no new dependencies

---

### Task 1: Create TaskQueue with serial execution

**Files:**
- Create: `src/queue.ts`
- Create: `tests/queue.test.ts`

**Step 1: Write the failing test**

Create `tests/queue.test.ts`:

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue } from '../src/queue.js';
import type { Task } from '../src/types.js';
import { runners } from '../src/agents/index.js';

function makeTask(slug: string): Task {
  return { slug, name: `Task ${slug}`, cron: '0 9 * * *', prompt: 'test' };
}

describe('TaskQueue', () => {
  test('executes tasks serially', async () => {
    const order: string[] = [];

    runners['claude'] = {
      async run(_prompt, task) {
        order.push(`start:${task.slug}`);
        await new Promise(r => setTimeout(r, 50));
        order.push(`end:${task.slug}`);
        return 'HEARTBEAT_OK';
      },
    };

    const queue = new TaskQueue();
    queue.enqueue(makeTask('b-task'));
    queue.enqueue(makeTask('a-task'));

    // Wait for both to complete
    await queue.waitUntilEmpty();

    // Should be serial: start→end, then start→end
    // Sorted by slug: a-task before b-task
    assert.deepEqual(order, [
      'start:a-task', 'end:a-task',
      'start:b-task', 'end:b-task',
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "executes tasks serially"`
Expected: FAIL — `TaskQueue` does not exist yet

**Step 3: Write minimal implementation**

Create `src/queue.ts`:

```typescript
import type { Task } from './types.js';
import { runTask } from './runner.js';

export class TaskQueue {
  private pending: Task[] = [];
  private running: boolean = false;
  private emptyResolvers: (() => void)[] = [];

  enqueue(task: Task): void {
    this.pending.push(task);
    // Sort pending by slug for deterministic order
    this.pending.sort((a, b) => a.slug.localeCompare(b.slug));
    this.process();
  }

  private async process(): Promise<void> {
    if (this.running || this.pending.length === 0) return;
    this.running = true;

    while (this.pending.length > 0) {
      const task = this.pending.shift()!;
      await runTask(task);
    }

    this.running = false;
    // Notify waiters
    for (const resolve of this.emptyResolvers) resolve();
    this.emptyResolvers = [];
  }

  /** Resolves when the queue is empty and nothing is running. For testing. */
  waitUntilEmpty(): Promise<void> {
    if (!this.running && this.pending.length === 0) return Promise.resolve();
    return new Promise(resolve => this.emptyResolvers.push(resolve));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "executes tasks serially"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/queue.ts tests/queue.test.ts
git commit -m "feat: add TaskQueue with serial execution"
```

---

### Task 2: Add deduplication — skip enqueue if slug is already queued or running

**Files:**
- Modify: `src/queue.ts`
- Modify: `tests/queue.test.ts`

**Step 1: Write the failing test**

Add to `tests/queue.test.ts`:

```typescript
test('skips enqueue when same slug is already queued', async () => {
  let runCount = 0;

  runners['claude'] = {
    async run(_prompt, task) {
      runCount++;
      await new Promise(r => setTimeout(r, 50));
      return 'HEARTBEAT_OK';
    },
  };

  const queue = new TaskQueue();
  const task = makeTask('dup-task');

  // Enqueue same task 3 times rapidly
  queue.enqueue(task);
  queue.enqueue(task);
  queue.enqueue(task);

  await queue.waitUntilEmpty();

  // Should only run once (first enqueue starts it; second and third are deduped)
  assert.equal(runCount, 1);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "skips enqueue when same slug"`
Expected: FAIL — runs 3 times instead of 1

**Step 3: Add dedup logic to `src/queue.ts`**

Update the `enqueue` method and add a `runningSlug` field:

```typescript
export class TaskQueue {
  private pending: Task[] = [];
  private running: boolean = false;
  private runningSlug: string | null = null;
  private emptyResolvers: (() => void)[] = [];

  enqueue(task: Task): void {
    // Dedup: skip if already running or already in pending
    if (this.runningSlug === task.slug) return;
    if (this.pending.some(t => t.slug === task.slug)) return;

    this.pending.push(task);
    this.pending.sort((a, b) => a.slug.localeCompare(b.slug));
    this.process();
  }

  private async process(): Promise<void> {
    if (this.running || this.pending.length === 0) return;
    this.running = true;

    while (this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.runningSlug = task.slug;
      await runTask(task);
      this.runningSlug = null;
    }

    this.running = false;
    for (const resolve of this.emptyResolvers) resolve();
    this.emptyResolvers = [];
  }

  waitUntilEmpty(): Promise<void> {
    if (!this.running && this.pending.length === 0) return Promise.resolve();
    return new Promise(resolve => this.emptyResolvers.push(resolve));
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "skips enqueue"`
Expected: PASS

**Step 5: Run all queue tests**

Run: `npm test -- --test-name-pattern "TaskQueue"`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/queue.ts tests/queue.test.ts
git commit -m "feat: add deduplication to TaskQueue"
```

---

### Task 3: Add getState() for observable queue status

**Files:**
- Modify: `src/queue.ts`
- Modify: `tests/queue.test.ts`

**Step 1: Write the failing test**

Add to `tests/queue.test.ts`:

```typescript
test('getState() returns running and queued tasks', async () => {
  let resolveBlock: (() => void) | null = null;

  runners['claude'] = {
    async run(_prompt, task) {
      // Block until we release
      await new Promise<void>(r => { resolveBlock = r; });
      return 'HEARTBEAT_OK';
    },
  };

  const queue = new TaskQueue();
  queue.enqueue(makeTask('alpha'));
  queue.enqueue(makeTask('beta'));
  queue.enqueue(makeTask('gamma'));

  // Give the queue time to start the first task
  await new Promise(r => setTimeout(r, 10));

  const state = queue.getState();
  assert.equal(state.running, 'alpha');
  assert.deepEqual(state.queued, ['beta', 'gamma']);

  // Release all tasks
  resolveBlock!();
  await new Promise(r => setTimeout(r, 10));
  resolveBlock!();
  await new Promise(r => setTimeout(r, 10));
  resolveBlock!();
  await queue.waitUntilEmpty();

  const emptyState = queue.getState();
  assert.equal(emptyState.running, null);
  assert.deepEqual(emptyState.queued, []);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "getState"`
Expected: FAIL — `getState` is not a function

**Step 3: Add getState() to `src/queue.ts`**

Add this interface export and method:

```typescript
export interface QueueState {
  running: string | null;   // slug of currently running task, or null
  queued: string[];         // slugs of pending tasks, in execution order
}
```

Add method to `TaskQueue`:

```typescript
getState(): QueueState {
  return {
    running: this.runningSlug,
    queued: this.pending.map(t => t.slug),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "getState"`
Expected: PASS

**Step 5: Run all queue tests**

Run: `npm test -- --test-name-pattern "TaskQueue"`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/queue.ts tests/queue.test.ts
git commit -m "feat: add getState() to TaskQueue for observable status"
```

---

### Task 4: Wire queue into scheduler

**Files:**
- Modify: `src/scheduler.ts`
- Modify: `tests/scheduler.test.ts`

**Step 1: Run existing scheduler tests to verify baseline**

Run: `npm test -- --test-name-pattern "listTasks|runNow"`
Expected: All PASS

**Step 2: Update `src/scheduler.ts` to use TaskQueue**

Replace the direct `void runTask(task)` call with queue enqueue. Export the queue instance so `status` can read it.

```typescript
import cron from 'node-cron';
import type { Task } from './types.js';
import { runTask } from './runner.js';
import { TaskQueue } from './queue.js';

const TIMEZONE = 'Asia/Shanghai';

export const taskQueue = new TaskQueue();

export function startScheduler(tasks: Task[]): void {
  if (tasks.length === 0) {
    console.warn('[agent-cron] no tasks found, nothing to schedule');
    return;
  }

  for (const task of tasks) {
    if (!cron.validate(task.cron)) {
      console.warn(
        `[agent-cron] invalid cron expression "${task.cron}" in task "${task.name}", skipping`
      );
      continue;
    }
    cron.schedule(task.cron, () => { taskQueue.enqueue(task); }, { timezone: TIMEZONE });
    console.log(`[agent-cron] scheduled: ${task.name} → ${task.cron} (${TIMEZONE})`);
  }

  console.log(
    `[agent-cron] scheduler running with ${tasks.length} task(s). Press Ctrl+C to stop.`
  );
}

export async function runNow(tasks: Task[], slug?: string): Promise<void> {
  const targets = slug ? tasks.filter((t) => t.slug === slug) : tasks;

  if (targets.length === 0) {
    console.error(
      slug ? `[agent-cron] task not found: "${slug}"` : '[agent-cron] no tasks to run'
    );
    process.exit(1);
  }

  for (const task of targets) {
    await runTask(task);
  }
}

export function listTasks(tasks: Task[]): void {
  if (tasks.length === 0) {
    console.log('[agent-cron] no tasks found');
    return;
  }
  console.log('\nRegistered tasks:\n');
  for (const task of tasks) {
    console.log(`  ${task.slug}`);
    console.log(`    name:   ${task.name}`);
    console.log(`    cron:   ${task.cron}`);
    console.log('');
  }
}
```

Note: `runNow` keeps direct `await runTask()` — it's a manual one-off command, serial by nature.

**Step 3: Run existing scheduler tests**

Run: `npm test -- --test-name-pattern "listTasks|runNow"`
Expected: All PASS (runNow still uses direct runTask, listTasks unchanged)

**Step 4: Commit**

```bash
git add src/scheduler.ts
git commit -m "feat: wire TaskQueue into startScheduler"
```

---

### Task 5: Update status command to show live queue state

**Files:**
- Modify: `src/status.ts`
- Modify: `tests/status.test.ts`

**Step 1: Write the failing test**

Add to `tests/status.test.ts`:

```typescript
import type { QueueState } from '../src/queue.js';

describe('statusAll with queue state', () => {
  test('shows running and queued tasks', () => {
    const mockState: QueueState = {
      running: 'task-a',
      queued: ['task-b'],
    };

    const cap = captureConsole();
    statusAll(makeTasks(['task-a', 'task-b']), mockState);
    cap.restore();

    const all = cap.lines.join('\n');
    assert.ok(all.includes('running'), 'expected "running" in output');
    assert.ok(all.includes('queued'), 'expected "queued" in output');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "shows running and queued"`
Expected: FAIL — `statusAll` doesn't accept a second argument

**Step 3: Update `src/status.ts`**

Import `QueueState` and add optional parameter to `statusAll`. When a task is running or queued, show that instead of the log-based status:

```typescript
import type { QueueState } from './queue.js';

// ... existing code ...

export function statusAll(tasks: Task[], queueState?: QueueState): void {
  const COL = { slug: 26, run: 14, status: 11, dur: 10 };

  const header =
    'TASK'.padEnd(COL.slug) +
    'LAST RUN'.padEnd(COL.run) +
    'STATUS'.padEnd(COL.status) +
    'DURATION';
  console.log(header);
  console.log('-'.repeat(header.length + 8));

  for (const task of tasks) {
    // Check live queue state first
    if (queueState?.running === task.slug) {
      console.log(
        task.slug.padEnd(COL.slug) +
        '→ running'.padEnd(COL.run) +
        '-'.padEnd(COL.status) +
        '-'
      );
      continue;
    }
    const queueIndex = queueState?.queued.indexOf(task.slug) ?? -1;
    if (queueIndex >= 0) {
      console.log(
        task.slug.padEnd(COL.slug) +
        `→ queued (#${queueIndex + 1})`.padEnd(COL.run) +
        '-'.padEnd(COL.status) +
        '-'
      );
      continue;
    }

    // Existing log-based status (unchanged)
    const latest = latestLogFile(task.slug);
    if (!latest) {
      console.log(
        task.slug.padEnd(COL.slug) +
        'never'.padEnd(COL.run) +
        '-'.padEnd(COL.status) +
        '-'
      );
      continue;
    }

    const parsed = parseLastEnd(latest.file);
    if (!parsed) {
      console.log(
        task.slug.padEnd(COL.slug) +
        latest.date.padEnd(COL.run) +
        'running?'.padEnd(COL.status) +
        '-'
      );
      continue;
    }

    const runTime = formatRunTime(latest.date, parsed.time);
    const statusLabel =
      parsed.status === 'ok' ? 'ok' :
      parsed.status === 'heartbeat' ? 'heartbeat' :
      `error ⚠`;

    const line =
      task.slug.padEnd(COL.slug) +
      runTime.padEnd(COL.run) +
      statusLabel.padEnd(COL.status) +
      parsed.duration;

    console.log(line);
    if (parsed.error) {
      console.log(' '.repeat(COL.slug) + `↳ ${parsed.error}`);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "shows running and queued"`
Expected: PASS

**Step 5: Run ALL status tests**

Run: `npm test -- --test-name-pattern "statusAll|logsFor"`
Expected: All PASS — existing tests still work because `queueState` is optional

**Step 6: Commit**

```bash
git add src/status.ts tests/status.test.ts
git commit -m "feat: show live queue state in status command"
```

---

### Task 6: Wire status command to pass queue state from scheduler

**Files:**
- Modify: `src/cli.ts`

**Step 1: Update `src/cli.ts` to pass queue state to statusAll**

```typescript
import { taskQueue } from './scheduler.js';

// ... in the switch/case for 'status':
case 'status':
  statusAll(tasks, taskQueue.getState());
  break;
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: pass live queue state to status command"
```

---

### Task 7: Manual integration test and final cleanup

**Step 1: Build**

Run: `npm run build`
Expected: No errors

**Step 2: Manual smoke test**

Run: `npm run list`
Expected: Lists all tasks normally

Run: `npm run dev -- status`
Expected: Shows status table (no queue activity since scheduler not running)

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit any final adjustments**

If any minor fixes needed, commit them:

```bash
git add -A
git commit -m "chore: final cleanup for serial task queue"
```
