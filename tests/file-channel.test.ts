import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileChannel } from '../src/outputs/file.js';
import type { Task } from '../src/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    slug: 'test-task',
    name: 'Test Task',
    cron: '0 9 * * *',
    output: 'file',
    prompt: 'test',
    ...overrides,
  };
}

describe('FileChannel', () => {
  test('writes result to {outputDir}/{slug}-{date}.md', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-file-'));
    const task = makeTask({ slug: 'my-task', outputDir: dir });
    const channel = new FileChannel();

    await channel.send('# Hello World', task);

    const date = new Date().toISOString().split('T')[0];
    const expected = path.join(dir, `my-task-${date}.md`);
    assert.ok(fs.existsSync(expected), `expected file ${expected} to exist`);
    assert.equal(fs.readFileSync(expected, 'utf-8'), '# Hello World');
  });

  test('creates outputDir if it does not exist', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-file-'));
    const newDir = path.join(base, 'nested', 'output');
    const task = makeTask({ slug: 'nested-task', outputDir: newDir });
    const channel = new FileChannel();

    await channel.send('content', task);

    assert.ok(fs.existsSync(newDir), 'expected nested directory to be created');
  });

  test('defaults outputDir to ./output when not set', async () => {
    const originalCwd = process.cwd();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-cwd-'));
    process.chdir(tmpDir);

    try {
      const task = makeTask({ slug: 'default-dir' });
      // no outputDir set
      delete (task as Record<string, unknown>)['outputDir'];
      const channel = new FileChannel();
      await channel.send('content', task);

      const date = new Date().toISOString().split('T')[0];
      const expected = path.join(tmpDir, 'output', `default-dir-${date}.md`);
      assert.ok(fs.existsSync(expected), `expected file ${expected} to exist`);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
