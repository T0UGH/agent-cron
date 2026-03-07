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

export interface AgentRunner {
  run(prompt: string, task: Task, logger?: Logger): Promise<string>
}
