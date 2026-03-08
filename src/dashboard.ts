import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Task } from './types.js';

function logsDir(): string {
  return path.join(os.homedir(), '.agent-cron', 'logs');
}

/** Parse the last [END] line from a log file. */
function parseLastEnd(logFile: string): { status: string; duration: string; time: string; cost: string | null } | null {
  let content: string;
  try {
    content = fs.readFileSync(logFile, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  let lastEnd: string | null = null;
  for (const line of lines) {
    if (line.includes('[END]')) lastEnd = line;
  }
  if (!lastEnd) return null;

  const tsMatch = lastEnd.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  const statusMatch = lastEnd.match(/status=(\w+)/);
  const durationMatch = lastEnd.match(/duration=(\S+)/);
  const costMatch = lastEnd.match(/cost=(\S+)/);

  if (!statusMatch) return null;

  return {
    status: statusMatch[1],
    duration: durationMatch?.[1] ?? '?',
    time: tsMatch?.[1] ?? '',
    cost: costMatch?.[1] ?? null,
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

/** Get all log files for a slug within the last N days. */
function logFilesForDays(slug: string, days: number): { file: string; date: string }[] {
  const slugDir = path.join(logsDir(), slug);
  if (!fs.existsSync(slugDir)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return fs.readdirSync(slugDir)
    .filter(f => f.endsWith('.log'))
    .map(f => ({ file: path.join(slugDir, f), date: f.replace('.log', '') }))
    .filter(f => f.date >= cutoffStr)
    .sort((a, b) => b.date.localeCompare(a.date));
}

interface DayStats {
  ok: number;
  heartbeat: number;
  error: number;
}

export function generateMarkdown(tasks: Task[]): string {
  const now = new Date();
  const updated = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);

  const lines: string[] = [];
  lines.push('# agent-cron status');
  lines.push('');
  lines.push(`Updated: ${updated}`);
  lines.push('');
  lines.push('| Task | Status | Last Run | Duration | Cost |');
  lines.push('|------|--------|----------|----------|------|');

  for (const task of tasks) {
    const latest = latestLogFile(task.slug);
    if (!latest) {
      lines.push(`| ${task.slug} | never | - | - | - |`);
      continue;
    }

    const parsed = parseLastEnd(latest.file);
    if (!parsed) {
      lines.push(`| ${task.slug} | running? | ${latest.date} | - | - |`);
      continue;
    }

    const hhmm = parsed.time.slice(11, 16);
    const durationMs = parseInt(parsed.duration.replace('ms', ''), 10);
    const durationSec = isNaN(durationMs) ? parsed.duration : `${Math.round(durationMs / 1000)}s`;

    const costStr = parsed.cost ? `$${parseFloat(parsed.cost).toFixed(4)}` : '-';
    lines.push(`| ${task.slug} | ${parsed.status} | ${hhmm} | ${durationSec} | ${costStr} |`);
  }

  // History (7 days)
  const dayMap = new Map<string, DayStats>();

  // Initialize last 7 days
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dayMap.set(dateStr, { ok: 0, heartbeat: 0, error: 0 });
  }

  for (const task of tasks) {
    const logFiles = logFilesForDays(task.slug, 7);
    for (const lf of logFiles) {
      const parsed = parseLastEnd(lf.file);
      if (!parsed) continue;
      const stats = dayMap.get(lf.date);
      if (!stats) continue;
      const s = parsed.status as 'ok' | 'heartbeat' | 'error';
      if (s === 'ok' || s === 'heartbeat' || s === 'error') {
        stats[s]++;
      }
    }
  }

  lines.push('');
  lines.push('## History (7 days)');
  lines.push('');
  lines.push('| Date | ok | heartbeat | error |');
  lines.push('|------|----|-----------|-------|');

  const sortedDays = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  for (const [date, stats] of sortedDays) {
    if (stats.ok + stats.heartbeat + stats.error === 0) continue;
    lines.push(`| ${date} | ${stats.ok} | ${stats.heartbeat} | ${stats.error} |`);
  }

  return lines.join('\n') + '\n';
}

export function writeDashboard(tasks: Task[]): void {
  const md = generateMarkdown(tasks);
  const outPath = path.join(os.homedir(), '.agent-cron', 'dashboard.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, 'utf-8');
}
