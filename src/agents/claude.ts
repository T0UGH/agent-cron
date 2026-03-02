import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentRunner, Task } from '../types.js';

export class ClaudeRunner implements AgentRunner {
  async run(prompt: string, task: Task): Promise<string> {
    const loadSkills = task.skills !== false;
    let result = '';

    const q = query({
      prompt,
      options: {
        cwd: process.cwd(),
        permissionMode: 'bypassPermissions',
        ...(loadSkills ? { settingSources: ['user'] } : {}),
      },
    });

    for await (const message of q) {
      if (message.type === 'result' && 'result' in message && message.result) {
        result = message.result;
      }
    }

    return result;
  }
}
