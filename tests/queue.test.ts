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
