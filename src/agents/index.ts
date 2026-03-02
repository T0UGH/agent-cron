import type { AgentRunner } from '../types.js';
import { ClaudeRunner } from './claude.js';

export const runners: Record<string, AgentRunner> = {
  claude: new ClaudeRunner(),
  // future: codex, opencode, copilot, ...
};
