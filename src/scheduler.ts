import cron from 'node-cron';
import type { Task } from './types.js';
import { runTask } from './runner.js';
import { TaskQueue } from './queue.js';
import { writeDashboard } from './dashboard.js';

export const taskQueue = new TaskQueue();

const TIMEZONE = 'Asia/Shanghai';

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

  taskQueue.onEmpty = () => { writeDashboard(tasks); };
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
