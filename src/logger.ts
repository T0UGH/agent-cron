import fs from 'fs';
import path from 'path';
import os from 'os';

export class Logger {
  private slug: string;
  private startTime: number = 0;

  constructor(slug: string) {
    this.slug = slug;
  }

  private logPath(): string {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(os.homedir(), '.agent-cron', 'logs', this.slug, `${today}.log`);
  }

  private write(line: string): void {
    const filePath = this.logPath();
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    fs.appendFileSync(filePath, `[${ts}] ${line}\n`, 'utf-8');
  }

  start(): void {
    this.startTime = Date.now();
    const filePath = this.logPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.write(`[START] task=${this.slug}`);
  }

  end(status: 'ok' | 'error' | 'heartbeat', error?: string): void {
    const duration = this.startTime > 0 ? `${Date.now() - this.startTime}ms` : 'unknown';
    const errPart = error ? ` error="${error}"` : '';
    this.write(`[END]   status=${status} duration=${duration}${errPart}`);
  }

  tool(name: string, input: unknown, output?: unknown): void {
    const inputStr = JSON.stringify(input);
    const outputStr = output !== undefined
      ? String(typeof output === 'string' ? output : JSON.stringify(output)).slice(0, 500)
      : '';
    this.write(`[TOOL]  name=${name} input=${inputStr}${outputStr ? ` output=${outputStr}` : ''}`);
  }
}
