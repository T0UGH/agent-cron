import type { Logger } from './logger.js';

export interface Task {
  slug: string
  name: string
  cron: string
  agent?: string
  skills?: boolean | string[]
  prompt: string
  [key: string]: unknown
}

export interface RunResult {
  result: string;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AgentRunner {
  run(prompt: string, task: Task, logger?: Logger, signal?: AbortSignal): Promise<string | RunResult>
}
