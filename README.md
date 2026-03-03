# agent-cron

Run Claude Agent SDK tasks on a cron schedule. Tasks are defined as `.md` files with YAML frontmatter.

## Install

```bash
npm install -g @t0u9h/agent-cron
# or use npx
npx @t0u9h/agent-cron list
```

## Usage

```bash
agent-cron start              # start scheduler (reads ./tasks/)
agent-cron start ./my-tasks   # specify tasks directory
agent-cron run                # run all tasks now
agent-cron run daily-news     # run one task by slug
agent-cron list               # list all tasks
```

## Task File Format

Create `.md` files in your `tasks/` directory:

```markdown
---
name: Daily AI News
cron: "0 9 * * *"
output: feishu
feishuWebhook: https://open.feishu.cn/open-apis/bot/v2/hook/xxx
---

Today is {date}. Search for the latest AI news and summarize.

If nothing new, output exactly: HEARTBEAT_OK
```

### Frontmatter fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | no | filename slug | display name |
| `cron` | **yes** | — | standard cron expression |
| `output` | **yes** | — | `file`, `github`, or `feishu` |
| `agent` | no | `claude` | agent runner (currently only `claude`) |
| `skills` | no | `true` | load `~/.claude/` skills via `settingSources: ['user']` |
| `outputDir` | no | `./output` | for `output: file` |
| `githubRepo` | if github | — | `owner/repo` format |
| `githubBranch` | no | `main` | for `output: github` |
| `githubDir` | no | `` (root) | subdirectory in repo |
| `githubToken` | no | `GITHUB_TOKEN` env | for `output: github` |
| `feishuWebhook` | no | `FEISHU_WEBHOOK` env | for `output: feishu` |

### Template variables

- `{date}` — replaced with today's date (locale: zh-CN)

## Output Channels

| Channel | Required config |
|---------|----------------|
| `file` | `outputDir` (default `./output`) |
| `feishu` | `feishuWebhook` or `FEISHU_WEBHOOK` env |
| `github` | `githubRepo`, `githubToken` or `GITHUB_TOKEN` env |

### HEARTBEAT_OK protocol

If the agent returns exactly `HEARTBEAT_OK`, the output step is skipped silently. Use this for tasks that only push when there's new content.

## Local Skills

By default, all tasks load your locally installed Claude Code skills (`~/.claude/plugins/`, `~/.claude/skills/`). To disable for a specific task:

```yaml
skills: false
```

## Environment Variables

```
ANTHROPIC_API_KEY=      # required
GITHUB_TOKEN=           # required for output: github
FEISHU_WEBHOOK=         # required for output: feishu (unless set per-task)
```

Copy `.env.example` to `.env` and fill in your values.

## Timezone

All cron expressions use `Asia/Shanghai` timezone.

## Extending

Adding a new output channel: implement `OutputChannel` interface and register it in `src/outputs/index.ts`.

Adding a new agent runner: implement `AgentRunner` interface and register it in `src/agents/index.ts`.
