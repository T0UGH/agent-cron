import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentRunner, Task } from '../types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

/**
 * Each standalone skill at ~/.claude/skills/<name>/SKILL.md needs to be wrapped
 * in a temporary plugin directory structure: skills/<name>/SKILL.md
 * The SDK `plugins` option only accepts a directory that contains a `skills/` subdir.
 */
function buildSkillPlugin(skillNames: string[]): string | null {
  const existing = skillNames.filter((name) =>
    fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md'))
  );
  if (existing.length === 0) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cron-skills-'));
  const skillsSubdir = path.join(tmpDir, 'skills');
  fs.mkdirSync(skillsSubdir);

  for (const name of existing) {
    const srcDir = path.join(SKILLS_DIR, name);
    const dstDir = path.join(skillsSubdir, name);
    fs.mkdirSync(dstDir);
    // Copy SKILL.md and any subdirectories (e.g. references/)
    fs.cpSync(srcDir, dstDir, { recursive: true, dereference: true });
  }

  return tmpDir;
}

export class ClaudeRunner implements AgentRunner {
  async run(prompt: string, task: Task): Promise<string> {
    const loadSkills = task.skills !== false;
    const skillNames = Array.isArray(task.skills) ? task.skills as string[] : [];
    let result = '';
    let tmpPluginDir: string | null = null;

    const plugins: { type: 'local'; path: string }[] = [];

    if (skillNames.length > 0) {
      tmpPluginDir = buildSkillPlugin(skillNames);
      if (tmpPluginDir) {
        plugins.push({ type: 'local', path: tmpPluginDir });
      }
    }

    try {
      const q = query({
        prompt,
        options: {
          cwd: process.cwd(),
          permissionMode: 'bypassPermissions',  // 允许所有工具，包括 WebSearch
          ...(loadSkills && skillNames.length === 0 ? { settingSources: ['user'] } : {}),
          ...(plugins.length > 0 ? { plugins } : {}),
        },
      });

      for await (const message of q) {
        if (message.type === 'result' && 'result' in message && message.result) {
          result = message.result;
        }
      }
    } finally {
      if (tmpPluginDir) {
        fs.rmSync(tmpPluginDir, { recursive: true, force: true });
      }
    }

    return result;
  }
}