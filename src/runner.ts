import type { Task } from './types.js';
import { runners } from './agents/index.js';
import { channels } from './outputs/index.js';

function buildPrompt(template: string): string {
  const date = new Date().toLocaleDateString('zh-CN');
  return template.replace(/\{date\}/g, date);
}

export async function runTask(task: Task): Promise<void> {
  console.log(`[agent-cron] starting: ${task.name} (${new Date().toLocaleString('zh-CN')})`);

  const agentName = String(task.agent ?? 'claude');
  const agentRunner = runners[agentName];
  if (!agentRunner) {
    console.error(`[agent-cron] unknown agent: "${agentName}" (${task.name})`);
    return;
  }

  const prompt = buildPrompt(task.prompt);
  let result = '';

  try {
    result = await agentRunner.run(prompt, task);
  } catch (err) {
    console.error(`[agent-cron] agent error (${task.name}):`, err);
    return;
  }

  if (!result) {
    console.error(`[agent-cron] no result returned (${task.name})`);
    return;
  }

  if (result.trim() === 'HEARTBEAT_OK') {
    console.log(`[agent-cron] OK — no new content (${task.name})`);
    return;
  }

  const channel = channels[task.output];
  if (!channel) {
    console.error(`[agent-cron] unknown output channel: "${task.output}" (${task.name})`);
    return;
  }

  try {
    await channel.send(result, task);
  } catch (err) {
    console.error(`[agent-cron] output error (${task.name}):`, err);
  }
}
