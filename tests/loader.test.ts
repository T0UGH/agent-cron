import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadTasks } from '../src/loader.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-test-'));
}

function writeTask(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

describe('loadTasks', () => {
  test('returns empty array when directory does not exist', () => {
    const result = loadTasks('/nonexistent/path/xyz');
    assert.deepEqual(result, []);
  });

  test('returns empty array when directory has no .md files', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello');
    const result = loadTasks(dir);
    assert.deepEqual(result, []);
  });

  test('parses a valid task file with all required fields', () => {
    const dir = makeTempDir();
    writeTask(dir, 'daily-news.md', `---
name: Daily News
cron: "0 9 * * *"
output: file
outputDir: ./output
---

Today is {date}. Summarize news.
`);

    const tasks = loadTasks(dir);
    assert.equal(tasks.length, 1);
    const t = tasks[0];
    assert.equal(t.slug, 'daily-news');
    assert.equal(t.name, 'Daily News');
    assert.equal(t.cron, '0 9 * * *');
    assert.equal(t.output, 'file');
    assert.equal(t.outputDir, './output');
    assert.equal(t.prompt.trim(), 'Today is {date}. Summarize news.');
  });

  test('uses filename slug as name when name is omitted', () => {
    const dir = makeTempDir();
    writeTask(dir, 'my-task.md', `---
cron: "0 8 * * *"
output: file
---

Hello.
`);

    const tasks = loadTasks(dir);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].name, 'my-task');
  });

  test('skips task missing required cron field', () => {
    const dir = makeTempDir();
    writeTask(dir, 'bad.md', `---
name: Bad Task
output: file
---

No cron here.
`);

    const tasks = loadTasks(dir);
    assert.equal(tasks.length, 0);
  });

  test('skips task missing required output field', () => {
    const dir = makeTempDir();
    writeTask(dir, 'bad.md', `---
name: Bad Task
cron: "0 9 * * *"
---

No output here.
`);

    const tasks = loadTasks(dir);
    assert.equal(tasks.length, 0);
  });

  test('loads multiple task files', () => {
    const dir = makeTempDir();
    writeTask(dir, 'task-a.md', `---
cron: "0 8 * * *"
output: file
---
A`);
    writeTask(dir, 'task-b.md', `---
cron: "0 9 * * *"
output: feishu
feishuWebhook: https://example.com/hook
---
B`);

    const tasks = loadTasks(dir);
    assert.equal(tasks.length, 2);
    const slugs = tasks.map((t) => t.slug).sort();
    assert.deepEqual(slugs, ['task-a', 'task-b']);
  });

  test('spreads channel-specific frontmatter fields onto task', () => {
    const dir = makeTempDir();
    writeTask(dir, 'gh-task.md', `---
cron: "0 9 * * *"
output: github
githubRepo: owner/repo
githubBranch: main
githubDir: daily
---
content`);

    const tasks = loadTasks(dir);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].githubRepo, 'owner/repo');
    assert.equal(tasks[0].githubBranch, 'main');
    assert.equal(tasks[0].githubDir, 'daily');
  });

  test('ignores non-.md files in directory', () => {
    const dir = makeTempDir();
    writeTask(dir, 'task.md', `---
cron: "0 9 * * *"
output: file
---
ok`);
    fs.writeFileSync(path.join(dir, 'task.ts'), 'code');
    fs.writeFileSync(path.join(dir, '.hidden'), 'hidden');

    const tasks = loadTasks(dir);
    assert.equal(tasks.length, 1);
  });
});
