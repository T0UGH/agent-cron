# Markdown Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After all queued tasks finish, auto-generate a markdown status page and push to the memory git repo for mobile viewing.

**Architecture:** New `src/dashboard.ts` generates markdown from log files. Queue gets an `onEmpty` callback. Scheduler wires them together.

**Tech Stack:** TypeScript, node:test, child_process for git, no new dependencies

---

### Task 1: Add onEmpty callback to TaskQueue

**Files:**
- Modify: `src/queue.ts`
- Modify: `tests/queue.test.ts`

**Step 1: Write the failing test**

Add to `tests/queue.test.ts`:

```typescript
test('calls onEmpty callback when queue finishes', async (t) => {
  const saved = runners['claude'];
  t.after(() => { runners['claude'] = saved; });

  let emptyCalled = 0;

  runners['claude'] = {
    async run() { return 'HEARTBEAT_OK'; },
  };

  const queue = new TaskQueue();
  queue.onEmpty = () => { emptyCalled++; };
  queue.enqueue(makeTask('task-a'));
  queue.enqueue(makeTask('task-b'));

  await queue.waitUntilEmpty();

  assert.equal(emptyCalled, 1, 'onEmpty should fire once after all tasks complete');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "calls onEmpty"`
Expected: FAIL — `onEmpty` property doesn't exist

**Step 3: Add onEmpty to TaskQueue**

In `src/queue.ts`, add a public property and call it at the end of `process()`:

```typescript
export class TaskQueue {
  // ... existing fields ...
  onEmpty: (() => void) | null = null;

  // ... in process(), after the while loop, before notifying emptyResolvers:
  //   if (this.onEmpty) this.onEmpty();
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "calls onEmpty"`
Expected: PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/queue.ts tests/queue.test.ts
git commit -m "feat: add onEmpty callback to TaskQueue"
```

---

### Task 2: Create dashboard generator

**Files:**
- Create: `src/dashboard.ts`
- Create: `tests/dashboard.test.ts`

**Step 1: Write the failing test**

Create `tests/dashboard.test.ts`:

```typescript
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-dash-test-'));
const origHome = os.homedir;
(os as any).homedir = () => tmpHome;

import { generateMarkdown } from '../src/dashboard.js';

after(() => {
  (os as any).homedir = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

const today = new Date().toISOString().slice(0, 10);

function writeLog(slug: string, date: string, content: string): void {
  const dir = path.join(tmpHome, '.agent-cron', 'logs', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${date}.log`), content, 'utf-8');
}

function makeTasks(slugs: string[]) {
  return slugs.map(slug => ({ slug, name: slug, cron: '0 9 * * *', prompt: '' }));
}

describe('generateMarkdown', () => {
  test('generates markdown with task status table', () => {
    writeLog('task-a', today,
      `[${today} 10:00:01.000] [START] task=task-a\n` +
      `[${today} 10:00:11.000] [END]   status=ok duration=10000ms\n`
    );
    writeLog('task-b', today,
      `[${today} 09:00:01.000] [START] task=task-b\n` +
      `[${today} 09:00:05.000] [END]   status=heartbeat duration=4000ms\n`
    );

    const md = generateMarkdown(makeTasks(['task-a', 'task-b']));

    assert.ok(md.includes('# agent-cron status'));
    assert.ok(md.includes('task-a'));
    assert.ok(md.includes('task-b'));
    assert.ok(md.includes('ok'));
    assert.ok(md.includes('heartbeat'));
  });

  test('shows "never" for tasks with no logs', () => {
    const md = generateMarkdown(makeTasks(['no-log-task']));
    assert.ok(md.includes('never'));
  });

  test('includes 7-day history section', () => {
    writeLog('hist-task', today,
      `[${today} 10:00:01.000] [START] task=hist-task\n` +
      `[${today} 10:00:11.000] [END]   status=ok duration=10000ms\n`
    );

    const md = generateMarkdown(makeTasks(['hist-task']));
    assert.ok(md.includes('## History'));
    assert.ok(md.includes(today));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "generateMarkdown"`
Expected: FAIL — module doesn't exist

**Step 3: Write `src/dashboard.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import type { Task } from './types.js';

function logsDir(): string {
  return path.join(os.homedir(), '.agent-cron', 'logs');
}

interface RunInfo {
  status: 'ok' | 'error' | 'heartbeat';
  duration: string;
  time: string;
}

function parseLastEnd(logFile: string): RunInfo | null {
  let content: string;
  try { content = fs.readFileSync(logFile, 'utf-8'); } catch { return null; }

  const lines = content.split('\n');
  let lastEnd: string | null = null;
  for (const line of lines) {
    if (line.includes('[END]')) lastEnd = line;
  }
  if (!lastEnd) return null;

  const tsMatch = lastEnd.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  const statusMatch = lastEnd.match(/status=(\w+)/);
  const durationMatch = lastEnd.match(/duration=(\S+)/);

  if (!statusMatch) return null;
  const rawStatus = statusMatch[1];
  const status = (rawStatus === 'ok' || rawStatus === 'error' || rawStatus === 'heartbeat')
    ? rawStatus : 'error';

  return {
    status,
    duration: durationMatch?.[1] ?? '?',
    time: tsMatch?.[1] ?? '',
  };
}

function getLogDates(slug: string): string[] {
  const slugDir = path.join(logsDir(), slug);
  if (!fs.existsSync(slugDir)) return [];
  return fs.readdirSync(slugDir)
    .filter(f => f.endsWith('.log'))
    .map(f => f.replace('.log', ''))
    .sort()
    .reverse();
}

export function generateMarkdown(tasks: Task[]): string {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);

  let md = `# agent-cron status\n\nUpdated: ${today} ${timeStr}\n\n`;
  md += `| Task | Status | Last Run | Duration |\n`;
  md += `|------|--------|----------|----------|\n`;

  for (const task of tasks) {
    const dates = getLogDates(task.slug);
    if (dates.length === 0) {
      md += `| ${task.slug} | never | - | - |\n`;
      continue;
    }
    const logFile = path.join(logsDir(), task.slug, `${dates[0]}.log`);
    const info = parseLastEnd(logFile);
    if (!info) {
      md += `| ${task.slug} | running? | ${dates[0]} | - |\n`;
      continue;
    }
    const hhmm = info.time.slice(11, 16) || '?';
    const dateLabel = dates[0] === today ? hhmm : `${dates[0]} ${hhmm}`;
    md += `| ${task.slug} | ${info.status} | ${dateLabel} | ${info.duration} |\n`;
  }

  // 7-day history
  md += `\n## History (7 days)\n\n`;
  md += `| Date | ok | heartbeat | error |\n`;
  md += `|------|----|-----------|-------|\n`;

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    let ok = 0, hb = 0, err = 0;
    for (const task of tasks) {
      const logFile = path.join(logsDir(), task.slug, `${dateStr}.log`);
      const info = parseLastEnd(logFile);
      if (!info) continue;
      if (info.status === 'ok') ok++;
      else if (info.status === 'heartbeat') hb++;
      else err++;
    }
    if (ok + hb + err === 0) continue;
    md += `| ${dateStr} | ${ok} | ${hb} | ${err} |\n`;
  }

  return md;
}

const MEMORY_DIR = path.join(os.homedir(), 'workspace', 'memory');
const DASHBOARD_FILE = 'agent-cron-status.md';

export function writeDashboard(tasks: Task[]): void {
  const md = generateMarkdown(tasks);
  const filePath = path.join(MEMORY_DIR, DASHBOARD_FILE);

  try {
    fs.writeFileSync(filePath, md, 'utf-8');
    execSync(
      `git add ${DASHBOARD_FILE} && git commit -m "chore: update agent-cron status" && git push`,
      { cwd: MEMORY_DIR, stdio: 'ignore', timeout: 30_000 }
    );
    console.log('[agent-cron] dashboard updated and pushed');
  } catch {
    // Silently ignore git errors (nothing to commit, network down, etc)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "generateMarkdown"`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/dashboard.ts tests/dashboard.test.ts
git commit -m "feat: add markdown dashboard generator"
```

---

### Task 3: Wire dashboard into scheduler

**Files:**
- Modify: `src/scheduler.ts`

**Step 1: Update scheduler to register onEmpty callback**

```typescript
import { writeDashboard } from './dashboard.js';

// In startScheduler, after setting up cron schedules:
taskQueue.onEmpty = () => { writeDashboard(tasks); };
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 3: Build**

Run: `npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/scheduler.ts
git commit -m "feat: auto-update dashboard when queue empties"
```

---

### Task 4: Manual smoke test

**Step 1: Generate dashboard manually**

Run `npm run dev -- run ai-news-agent-reach` or add a quick test script to generate the markdown and verify it looks right.

Alternatively, check `~/workspace/memory/agent-cron-status.md` after next cron run.

**Step 2: Verify markdown renders on GitHub**

Check: `https://github.com/T0UGH/macmini-memory/blob/main/agent-cron-status.md`
