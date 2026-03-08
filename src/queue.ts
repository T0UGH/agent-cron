import type { Task } from './types.js';
import { runTask } from './runner.js';

export interface QueueState {
  running: string | null;   // slug of currently running task, or null
  queued: string[];         // slugs of pending tasks, in execution order
}

export class TaskQueue {
  private pending: Task[] = [];
  private processing: boolean = false;
  private runningSlug: string | null = null;
  private emptyResolvers: (() => void)[] = [];
  public onEmpty: (() => void) | null = null;

  enqueue(task: Task): void {
    // Dedup: skip if this slug is currently running
    if (this.runningSlug === task.slug) return;
    // Dedup: skip if this slug is already pending
    if (this.pending.some(t => t.slug === task.slug)) return;

    this.pending.push(task);
    // Sort pending by slug for deterministic order
    this.pending.sort((a, b) => a.slug.localeCompare(b.slug));
    // Defer to microtask so synchronous enqueues batch together before processing
    queueMicrotask(() => this.process());
  }

  private async process(): Promise<void> {
    if (this.processing || this.pending.length === 0) return;
    this.processing = true;

    while (this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.runningSlug = task.slug;
      await runTask(task);
      this.runningSlug = null;
    }

    this.processing = false;
    this.onEmpty?.();
    // Notify waiters
    for (const resolve of this.emptyResolvers) resolve();
    this.emptyResolvers = [];
  }

  getState(): QueueState {
    return {
      running: this.runningSlug,
      queued: this.pending.map(t => t.slug),
    };
  }

  /** Resolves when the queue is empty and nothing is running. For testing. */
  waitUntilEmpty(): Promise<void> {
    if (!this.processing && this.pending.length === 0) return Promise.resolve();
    return new Promise(resolve => this.emptyResolvers.push(resolve));
  }
}
