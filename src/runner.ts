import type { Task, RunResult } from './types.js';
import { runners } from './agents/index.js';
import { Logger } from './logger.js';

const DEFAULT_TIMEOUT_MINUTES = 10;

function buildPrompt(template: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return template.replace(/\{date\}/g, date);
}

function normalizeResult(raw: string | RunResult): { result: string; usage?: { cost?: number; inputTokens?: number; outputTokens?: number } } {
  if (typeof raw === 'string') return { result: raw };
  return {
    result: raw.result,
    usage: (raw.cost !== undefined || raw.inputTokens !== undefined || raw.outputTokens !== undefined)
      ? { cost: raw.cost, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }
      : undefined,
  };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message === 'aborted');
}

export async function runTask(task: Task): Promise<void> {
  const logger = new Logger(task.slug);
  logger.start();

  const agentName = String(task.agent ?? 'claude');
  const agentRunner = runners[agentName];
  if (!agentRunner) {
    const msg = `unknown agent: "${agentName}"`;
    console.error(`[agent-cron] ${msg} (${task.name})`);
    logger.end('error', msg);
    return;
  }

  const prompt = buildPrompt(task.prompt);
  const timeoutMinutes = typeof task.timeout === 'number' ? task.timeout : DEFAULT_TIMEOUT_MINUTES;

  const ac = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMinutes > 0) {
    timeoutId = setTimeout(() => ac.abort(), timeoutMinutes * 60 * 1000);
  }

  try {
    const raw = await agentRunner.run(prompt, task, logger, ac.signal);
    const { result, usage } = normalizeResult(raw);

    if (!result) {
      const msg = 'no result returned';
      console.error(`[agent-cron] ${msg} (${task.name})`);
      logger.end('error', msg, usage);
      return;
    }

    if (result.trim() === 'HEARTBEAT_OK') {
      console.log(`[agent-cron] OK — no new content (${task.name})`);
      logger.end('heartbeat', undefined, usage);
      return;
    }

    console.log(`[agent-cron] done: ${task.name}`);
    logger.end('ok', undefined, usage);
  } catch (err: any) {
    if (isAbortError(err)) {
      const msg = `timeout after ${timeoutMinutes}m`;
      console.error(`[agent-cron] ${msg} (${task.name})`);
      logger.end('error', msg);
    } else {
      console.error(`[agent-cron] agent error (${task.name}):`, err);
      logger.end('error', err?.message ?? String(err));
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
