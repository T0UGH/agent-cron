import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { QueueState } from '../src/queue.js';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-status-test-'));
const origHome = os.homedir;
(os as any).homedir = () => tmpHome;

import { statusAll, logsFor } from '../src/status.js';

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

function captureConsole(): { restore: () => void; lines: string[] } {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: any[]) => lines.push(args.join(' '));
  return { restore: () => { console.log = orig; }, lines };
}

describe('statusAll', () => {
  test('shows "never" for tasks with no logs', () => {
    const cap = captureConsole();
    statusAll(makeTasks(['no-log-task']));
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('never')), 'expected "never" in output');
  });

  test('shows ok status from log file', () => {
    writeLog('ok-task', today,
      `[${today} 10:00:01.000] [START] task=ok-task\n` +
      `[${today} 10:00:11.000] [END]   status=ok duration=10000ms\n`
    );
    const cap = captureConsole();
    statusAll(makeTasks(['ok-task']));
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('ok-task') && l.includes('ok')));
  });

  test('shows heartbeat status', () => {
    writeLog('hb-task', today,
      `[${today} 09:00:01.000] [START] task=hb-task\n` +
      `[${today} 09:00:05.000] [END]   status=heartbeat duration=4000ms\n`
    );
    const cap = captureConsole();
    statusAll(makeTasks(['hb-task']));
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('hb-task') && l.includes('heartbeat')));
  });

  test('shows error status with message', () => {
    writeLog('err-task', today,
      `[${today} 09:00:01.000] [START] task=err-task\n` +
      `[${today} 09:00:03.000] [END]   status=error duration=2000ms error="something failed"\n`
    );
    const cap = captureConsole();
    statusAll(makeTasks(['err-task']));
    cap.restore();
    assert.ok(cap.lines.some(l => l.includes('err-task') && l.includes('error')));
    assert.ok(cap.lines.some(l => l.includes('something failed')));
  });
});

describe('logsFor', () => {
  test('prints log file content', () => {
    writeLog('log-task', today, '[START] task=log-task\n[END]   status=ok\n');
    const cap = captureConsole();
    logsFor('log-task', today);
    cap.restore();
    assert.ok(cap.lines.join('\n').includes('[START]'));
  });

  test('falls back to latest log when today has none', () => {
    writeLog('old-task', '2026-01-01', '[START] task=old-task\n[END]   status=ok\n');
    const cap = captureConsole();
    logsFor('old-task');  // no date arg → today → not found → fallback
    cap.restore();
    assert.ok(cap.lines.join('\n').includes('[START]'));
  });
});

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
