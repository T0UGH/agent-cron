import type { AgentRunner } from '../types.js';
import { ClaudeRunner } from './claude.js';
import { ShellRunner } from './shell.js';

export const runners: Record<string, AgentRunner> = {
  claude: new ClaudeRunner(),
  shell: new ShellRunner(),  // 添加 shell runner
  // future: codex, opencode, copilot, ...
};