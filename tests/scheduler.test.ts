import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { listTasks, runNow } from '../src/scheduler.js';
import { runners } from '../src/agents/index.js';
import type { Task, AgentRunner } from '../src/types.js';

function makeTask(slug: string, overrides: Partial<Task> = {}): Task {
  return {
    slug,
    name: `Task ${slug}`,
    cron: '0 9 * * *',
    prompt: 'test',
    ...overrides,
  };
}

function captureConsole(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const origError = console.error.bind(console);
  const origLog = console.log.bind(console);
  console.error = (...args: unknown[]) => messages.push(String(args[0]));
  console.log = (...args: unknown[]) => messages.push(String(args[0]));
  return {
    messages,
    restore() {
      console.error = origError;
      console.log = origLog;
    },
  };
}

describe('listTasks', () => {
  test('prints each task slug, name, cron', () => {
    const tasks = [
      makeTask('alpha', { name: 'Alpha Task', cron: '0 8 * * *' }),
      makeTask('beta', { name: 'Beta Task', cron: '0 9 * * *' }),
    ];

    const cap = captureConsole();
    listTasks(tasks);
    cap.restore();

    const all = cap.messages.join('\n');
    assert.ok(all.includes('alpha'));
    assert.ok(all.includes('Alpha Task'));
    assert.ok(all.includes('0 8 * * *'));
    assert.ok(all.includes('beta'));
    assert.ok(all.includes('Beta Task'));
    assert.ok(all.includes('0 9 * * *'));
  });

  test('prints message when no tasks', () => {
    const cap = captureConsole();
    listTasks([]);
    cap.restore();

    assert.ok(cap.messages.some((m) => m.includes('no tasks found')));
  });
});

describe('runNow', () => {
  test('runs all tasks when no slug given', async () => {
    const executed: string[] = [];

    (runners as Record<string, AgentRunner>)['claude'] = {
      async run(_prompt, task) {
        executed.push(task.slug);
        return 'HEARTBEAT_OK';
      },
    };

    const tasks = [makeTask('task-a'), makeTask('task-b')];
    const cap = captureConsole();
    await runNow(tasks);
    cap.restore();

    assert.deepEqual(executed.sort(), ['task-a', 'task-b']);
  });

  test('runs only matching task when slug given', async () => {
    const executed: string[] = [];

    (runners as Record<string, AgentRunner>)['claude'] = {
      async run(_prompt, task) {
        executed.push(task.slug);
        return 'HEARTBEAT_OK';
      },
    };

    const tasks = [makeTask('task-a'), makeTask('task-b'), makeTask('task-c')];
    const cap = captureConsole();
    await runNow(tasks, 'task-b');
    cap.restore();

    assert.deepEqual(executed, ['task-b']);
  });

  test('calls process.exit(1) when slug not found', async () => {
    const tasks = [makeTask('existing')];

    // Intercept process.exit
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => { exitCode = code; }) as typeof process.exit;

    const cap = captureConsole();
    await runNow(tasks, 'nonexistent').catch(() => {});
    cap.restore();
    process.exit = origExit;

    assert.equal(exitCode, 1);
  });

  test('calls process.exit(1) when tasks list is empty', async () => {
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => { exitCode = code; }) as typeof process.exit;

    const cap = captureConsole();
    await runNow([]).catch(() => {});
    cap.restore();
    process.exit = origExit;

    assert.equal(exitCode, 1);
  });
});
