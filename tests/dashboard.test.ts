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

  test('shows cost column from log usage data', () => {
    writeLog('cost-task', today,
      `[${today} 10:00:01.000] [START] task=cost-task\n` +
      `[${today} 10:00:11.000] [END]   status=ok duration=10000ms cost=0.0456 in=3000 out=1200\n`
    );
    const md = generateMarkdown(makeTasks(['cost-task']));
    assert.ok(md.includes('Cost'), 'expected Cost column header');
    assert.ok(md.includes('$0.0456'), 'expected formatted cost value with $ prefix');
  });

  test('shows "-" for cost when log has no usage data', () => {
    writeLog('no-cost-task', today,
      `[${today} 10:00:01.000] [START] task=no-cost-task\n` +
      `[${today} 10:00:11.000] [END]   status=ok duration=10000ms\n`
    );
    const md = generateMarkdown(makeTasks(['no-cost-task']));
    assert.ok(md.includes('Cost'), 'expected Cost column header');
    const lines = md.split('\n');
    const row = lines.find(l => l.includes('no-cost-task'));
    assert.ok(row, 'expected a row for no-cost-task');
    assert.ok(row!.includes('| - |'), 'expected "-" for missing cost');
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
