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
    // Defer to microtask so synchronous enqueues batch together before processing
    queueMicrotask(() => this.process());
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
