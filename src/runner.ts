import type { Task } from './types.js';
import { runners } from './agents/index.js';
import { Logger } from './logger.js';

function buildPrompt(template: string): string {
  const date = new Date().toLocaleDateString('zh-CN');
  return template.replace(/\{date\}/g, date);
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

  try {
    const result = await agentRunner.run(prompt, task, logger);

    if (!result) {
      const msg = 'no result returned';
      console.error(`[agent-cron] ${msg} (${task.name})`);
      logger.end('error', msg);
      return;
    }

    if (result.trim() === 'HEARTBEAT_OK') {
      console.log(`[agent-cron] OK — no new content (${task.name})`);
      logger.end('heartbeat');
      return;
    }

    console.log(`[agent-cron] done: ${task.name}`);
    logger.end('ok');
  } catch (err: any) {
    console.error(`[agent-cron] agent error (${task.name}):`, err);
    logger.end('error', err?.message ?? String(err));
  }
}
