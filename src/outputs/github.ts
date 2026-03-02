import { Octokit } from '@octokit/rest';
import type { OutputChannel, Task } from '../types.js';

export class GithubChannel implements OutputChannel {
  async send(result: string, task: Task): Promise<void> {
    const repo = task.githubRepo as string | undefined;
    if (!repo) {
      throw new Error(`[agent-cron] github: missing githubRepo for task "${task.name}"`);
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      throw new Error(
        `[agent-cron] github: invalid githubRepo format "${repo}", expected "owner/repo"`
      );
    }

    const token =
      (task.githubToken as string | undefined) ?? process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error(
        `[agent-cron] github: missing token for task "${task.name}". Set githubToken in frontmatter or GITHUB_TOKEN env var.`
      );
    }

    const branch = String(task.githubBranch ?? 'main');
    const dir = task.githubDir ? String(task.githubDir) : '';
    const date = new Date().toISOString().split('T')[0];
    const fileName = `${task.slug}-${date}.md`;
    const filePath = dir ? `${dir}/${fileName}` : fileName;

    const octokit = new Octokit({ auth: token });
    const content = Buffer.from(result, 'utf-8').toString('base64');
    const message = `chore: ${task.name} ${date}`;

    // Check if file exists (to get sha for update)
    let sha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });
      if (!Array.isArray(data) && data.type === 'file') sha = data.sha;
    } catch {
      // file doesn't exist yet, sha stays undefined
    }

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: filePath,
      message,
      content,
      branch,
      ...(sha ? { sha } : {}),
    });

    console.log(`[agent-cron] pushed to GitHub ${repo}/${filePath} (${task.name})`);
  }
}
