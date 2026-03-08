#!/usr/bin/env node
import 'dotenv/config';
import path from 'path';
import { loadTasks } from './loader.js';
import { startScheduler, runNow, listTasks, taskQueue } from './scheduler.js';
import { statusAll, logsFor } from './status.js';

const args = process.argv.slice(2);
const command = args[0];

// Resolve tasks directory: default ./tasks, or explicit argument after command
// For 'start [dir]': dir is args[1]
// For 'run [slug]': args[1] is a slug, not a directory
const dirArg =
  command === 'start' && args[1] && !args[1].startsWith('-') ? args[1] : undefined;
const tasksDir = path.resolve(dirArg ?? './tasks');

const tasks = loadTasks(tasksDir);

switch (command) {
  case 'start':
    startScheduler(tasks);
    break;

  case 'run': {
    const slug = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
    await runNow(tasks, slug);
    break;
  }

  case 'list':
    listTasks(tasks);
    break;

  case 'status':
    statusAll(tasks, taskQueue.getState());
    break;

  case 'logs': {
    const slug = args[1];
    if (!slug) {
      console.error('Usage: agent-cron logs <slug> [date]');
      process.exit(1);
    }
    logsFor(slug, args[2]);
    break;
  }

  case 'dashboard': {
    const { generateMarkdown, writeDashboard } = await import('./dashboard.js');
    const md = generateMarkdown(tasks);
    console.log(md);
    writeDashboard(tasks);
    break;
  }

  default:
    console.log(`
agent-cron — run Claude Agent SDK tasks on a cron schedule

Usage:
  agent-cron start [dir]        Start scheduler (default dir: ./tasks)
  agent-cron start ./my-tasks   Specify tasks directory
  agent-cron run [slug]         Run all tasks or one by slug immediately
  agent-cron list               List all registered tasks
  agent-cron status             Show last run status for all tasks
  agent-cron logs <slug> [date] Show logs for a task (date: YYYY-MM-DD, default: today)
  agent-cron dashboard          Generate and write dashboard.md

Options:
  dir     Path to tasks directory (default: ./tasks)
  slug    Task filename without .md extension

Environment:
  ANTHROPIC_API_KEY    Required
  GITHUB_TOKEN         Required for output: github
  FEISHU_WEBHOOK       Required for output: feishu (unless set per-task)
`);
    process.exit(command ? 1 : 0);
}
