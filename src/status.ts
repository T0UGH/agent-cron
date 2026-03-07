import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Task } from './types.js';

function logsDir(): string {
  return path.join(os.homedir(), '.agent-cron', 'logs');
}

export interface TaskStatus {
  slug: string;
  name: string;
  lastRun: string | null;   // "today HH:MM" or "YYYY-MM-DD"
  status: 'ok' | 'error' | 'heartbeat' | 'never';
  duration: string | null;
  error: string | null;
}

/** Parse the last [END] line from a log file. */
function parseLastEnd(logFile: string): { status: 'ok' | 'error' | 'heartbeat'; duration: string; error: string | null; time: string } | null {
  let content: string;
  try {
    content = fs.readFileSync(logFile, 'utf-8');
  } catch {
    return null;
  }

  // Find all END lines, take the last one
  const lines = content.split('\n');
  let lastEnd: string | null = null;
  let lastStart: string | null = null;
  for (const line of lines) {
    if (line.includes('[END]')) lastEnd = line;
    if (line.includes('[START]')) lastStart = line;
  }
  if (!lastEnd) return null;

  // Extract timestamp from "[2026-03-07 10:00:01.123] [END]   status=ok duration=12345ms"
  const tsMatch = lastEnd.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  const statusMatch = lastEnd.match(/status=(\w+)/);
  const durationMatch = lastEnd.match(/duration=(\S+)/);
  const errorMatch = lastEnd.match(/error="([^"]+)"/);

  if (!statusMatch) return null;

  const rawStatus = statusMatch[1];
  const status = (rawStatus === 'ok' || rawStatus === 'error' || rawStatus === 'heartbeat')
    ? rawStatus : 'error';

  return {
    status,
    duration: durationMatch?.[1] ?? '?',
    error: errorMatch?.[1] ?? null,
    time: tsMatch?.[1] ?? '',
  };
}

/** Find the most recent log file for a slug. */
function latestLogFile(slug: string): { file: string; date: string } | null {
  const slugDir = path.join(logsDir(), slug);
  if (!fs.existsSync(slugDir)) return null;

  const files = fs.readdirSync(slugDir)
    .filter(f => f.endsWith('.log'))
    .sort()
    .reverse();

  if (files.length === 0) return null;
  return { file: path.join(slugDir, files[0]), date: files[0].replace('.log', '') };
}

/** Format a log date for display: "today HH:MM" or "YYYY-MM-DD HH:MM". */
function formatRunTime(logDate: string, time: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const hhmm = time.slice(11, 16); // "HH:MM"
  return logDate === today ? `今天 ${hhmm}` : `${logDate} ${hhmm}`;
}

export function statusAll(tasks: Task[]): void {
  const COL = { slug: 26, run: 14, status: 11, dur: 10 };

  const header =
    'TASK'.padEnd(COL.slug) +
    'LAST RUN'.padEnd(COL.run) +
    'STATUS'.padEnd(COL.status) +
    'DURATION';
  console.log(header);
  console.log('-'.repeat(header.length + 8));

  for (const task of tasks) {
    const latest = latestLogFile(task.slug);
    if (!latest) {
      console.log(
        task.slug.padEnd(COL.slug) +
        'never'.padEnd(COL.run) +
        '-'.padEnd(COL.status) +
        '-'
      );
      continue;
    }

    const parsed = parseLastEnd(latest.file);
    if (!parsed) {
      console.log(
        task.slug.padEnd(COL.slug) +
        latest.date.padEnd(COL.run) +
        'running?'.padEnd(COL.status) +
        '-'
      );
      continue;
    }

    const runTime = formatRunTime(latest.date, parsed.time);
    const statusLabel =
      parsed.status === 'ok' ? 'ok' :
      parsed.status === 'heartbeat' ? 'heartbeat' :
      `error ⚠`;

    const line =
      task.slug.padEnd(COL.slug) +
      runTime.padEnd(COL.run) +
      statusLabel.padEnd(COL.status) +
      parsed.duration;

    console.log(line);
    if (parsed.error) {
      console.log(' '.repeat(COL.slug) + `↳ ${parsed.error}`);
    }
  }
}

export function logsFor(slug: string, date?: string): void {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const logFile = path.join(logsDir(), slug, `${targetDate}.log`);

  if (!fs.existsSync(logFile)) {
    // Try most recent if today not found
    const latest = latestLogFile(slug);
    if (!latest) {
      console.error(`No logs found for task: ${slug}`);
      process.exit(1);
    }
    if (!date) {
      // Fall back to latest
      console.log(`(no log for today, showing ${latest.date})\n`);
      console.log(fs.readFileSync(latest.file, 'utf-8'));
      return;
    }
    console.error(`No log found: ${logFile}`);
    process.exit(1);
  }

  console.log(fs.readFileSync(logFile, 'utf-8'));
}
