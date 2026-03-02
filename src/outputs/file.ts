import fs from 'fs';
import path from 'path';
import type { OutputChannel, Task } from '../types.js';

export class FileChannel implements OutputChannel {
  async send(result: string, task: Task): Promise<void> {
    const outputDir = String(task.outputDir ?? './output');
    fs.mkdirSync(outputDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(outputDir, `${task.slug}-${date}.md`);
    fs.writeFileSync(filePath, result, 'utf-8');
    console.log(`[agent-cron] written to ${filePath} (${task.name})`);
  }
}
