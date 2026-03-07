import type { AgentRunner, Task } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Shell runner - 直接执行 shell 命令或脚本
 */
export class ShellRunner implements AgentRunner {
  async run(prompt: string, task: Task): Promise<string> {
    // 从 prompt 中提取要执行的命令
    const bashMatch = prompt.match(/```bash\n([\s\S]+?)\n```/);

    if (!bashMatch) {
      return 'HEARTBEAT_OK'; // 没有找到 bash 命令
    }

    const command = bashMatch[1].trim();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        env: { ...process.env },
        timeout: 120000, // 2 分钟超时
      });

      if (stderr) {
        console.error(`[shell-runner] stderr: ${stderr}`);
      }

      return stdout.trim() || 'HEARTBEAT_OK';
    } catch (error: any) {
      console.error(`[shell-runner] error:`, error.message);

      // 如果是正常的 HEARTBEAT_OK 输出，不算错误
      if (error.stdout && error.stdout.includes('HEARTBEAT_OK')) {
        return 'HEARTBEAT_OK';
      }

      throw error;
    }
  }
}