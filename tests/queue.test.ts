import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue } from '../src/queue.js';
import type { Task } from '../src/types.js';
import { runners } from '../src/agents/index.js';

function makeTask(slug: string): Task {
  return { slug, name: `Task ${slug}`, cron: '0 9 * * *', prompt: 'test' };
}

describe('TaskQueue', () => {
  test('executes tasks serially', async (t) => {
    const saved = runners['claude'];
    t.after(() => { runners['claude'] = saved; });

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

  test('skips enqueue when same slug is already queued', async (t) => {
    const saved = runners['claude'];
    t.after(() => { runners['claude'] = saved; });

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

    // Should only run once (first enqueue starts processing; second and third are deduped)
    assert.equal(runCount, 1);
  });

  test('calls onEmpty callback when queue finishes', async (t) => {
    const saved = runners['claude'];
    t.after(() => { runners['claude'] = saved; });

    let emptyCalled = 0;
    runners['claude'] = { async run() { return 'HEARTBEAT_OK'; } };

    const queue = new TaskQueue();
    queue.onEmpty = () => { emptyCalled++; };
    queue.enqueue(makeTask('task-a'));
    queue.enqueue(makeTask('task-b'));
    await queue.waitUntilEmpty();

    assert.equal(emptyCalled, 1);
  });

  test('getState() returns running and queued tasks', async (t) => {
    const saved = runners['claude'];
    t.after(() => { runners['claude'] = saved; });

    let resolveBlock: (() => void) | null = null;

    runners['claude'] = {
      async run(_prompt, task) {
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
});
