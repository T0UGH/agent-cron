export interface Task {
  slug: string           // filename without .md
  name: string           // display name
  cron: string           // cron expression
  output: string         // channel name: 'file' | 'github' | 'feishu' | ...
  agent?: string         // agent runner name, default 'claude'
  skills?: boolean | string[]  // false = no skills; string[] = load specific skills by name; true/omit = load all user skills
  prompt: string         // prompt template body, {date} substituted at runtime
  [key: string]: unknown // channel-specific config (feishuWebhook, githubRepo, etc.)
}

export interface OutputChannel {
  send(result: string, task: Task): Promise<void>
}

export interface AgentRunner {
  run(prompt: string, task: Task): Promise<string>
}
