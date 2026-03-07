import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Task } from './types.js';

export function loadTasks(dir: string): Task[] {
  if (!fs.existsSync(dir)) {
    console.warn(`[agent-cron] tasks directory not found: ${dir}`);
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const filePath = path.join(dir, f);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(raw);
      const slug = f.replace(/\.md$/, '');

      if (!data.cron) {
        console.warn(`[agent-cron] task "${slug}" missing required field: cron, skipping`);
        return null;
      }

      const task: Task = {
        slug,
        name: String(data.name ?? slug),
        cron: String(data.cron),
        prompt: content.trim(),
        // spread all other frontmatter fields (agent, skills, and any extra config)
        ...Object.fromEntries(
          Object.entries(data).filter(([k]) => !['name', 'cron'].includes(k))
        ),
      };

      return task;
    })
    .filter((t): t is Task => t !== null);
}
