# agent-cron

> 中文文档：[README.zh.md](./README.zh.md)

Run Claude Agent SDK tasks on a cron schedule. Tasks are plain `.md` files — write a prompt, set a cron expression, pick an output channel. That's it.

```
tasks/
  daily-ai-news.md    ← runs at 9am, sends to Feishu
  weekly-report.md    ← runs Monday 8am, writes to GitHub
```

## Install

```bash
npm install -g @t0u9h/agent-cron
# or use without installing
npx @t0u9h/agent-cron list
```

## Claude Code Skill

Manage tasks via natural language in Claude Code:

```bash
/claude install marketplace https://github.com/T0UGH/agent-cron/raw/main/.claude-plugin/marketplace.json
```

Once installed:
- "帮我创建一个每天早9点搜 AI 新闻发飞书的任务"
- "列出所有定时任务"
- "立即运行 daily-ai-news"
- "帮我配置 agent-cron 开机自启"

The skill automatically configures macOS auto-start (launchd) when you create your first task.

## Quick Start

**1. Create a task file**

```bash
mkdir tasks
cat > tasks/daily-news.md << 'EOF'
---
name: Daily AI News
cron: "0 9 * * *"
output: file
outputDir: ./output
---

Today is {date}. Search for the latest AI coding news and summarize in 5 bullet points.

If nothing new, output exactly: HEARTBEAT_OK
EOF
```

**2. Set your API key**

```bash
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY
```

**3. Run once to test**

```bash
agent-cron run daily-news
```

**4. Start the scheduler**

```bash
agent-cron start
```

## CLI

```bash
agent-cron start              # start scheduler (reads ./tasks/, stays running)
agent-cron start ./my-tasks   # use a different tasks directory
agent-cron run                # run all tasks immediately (one-off)
agent-cron run daily-news     # run one task by slug immediately
agent-cron list               # list all registered tasks with cron expressions
```

`start` is a long-running process. Use launchd (macOS), systemd (Linux), or pm2 to keep it running.

## Task File Format

Each task is a `.md` file in your tasks directory:

```markdown
---
name: Daily AI News          # display name (default: filename slug)
cron: "0 9 * * *"            # cron expression (Asia/Shanghai timezone)
output: feishu               # output channel: file | feishu | github
feishuWebhook: https://...   # channel-specific config (see below)
---

Today is {date}. Search for the latest AI news...

If nothing to report, output exactly: HEARTBEAT_OK
```

### Frontmatter fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | no | filename slug | display name |
| `cron` | **yes** | — | standard 5-field cron expression |
| `output` | **yes** | — | `file`, `feishu`, or `github` |
| `agent` | no | `claude` | agent runner (currently only `claude`) |
| `skills` | no | `true` | load `~/.claude/` skills (set `false` to isolate) |

### Output channel fields

**`output: file`**

| Field | Required | Default |
|-------|----------|---------|
| `outputDir` | no | `./output` |

Writes `{outputDir}/{slug}-{YYYY-MM-DD}.md`.

**`output: feishu`**

| Field | Required | Default |
|-------|----------|---------|
| `feishuWebhook` | no | `FEISHU_WEBHOOK` env |

Converts Markdown to Feishu rich text (post format). h1 becomes the card title.

**`output: github`**

| Field | Required | Default |
|-------|----------|---------|
| `githubRepo` | **yes** | — |
| `githubBranch` | no | `main` |
| `githubDir` | no | repo root |
| `githubToken` | no | `GITHUB_TOKEN` env |

Creates/updates `{githubDir}/{slug}-{YYYY-MM-DD}.md` via GitHub Contents API. No local git needed.

### Template variables

| Variable | Value |
|----------|-------|
| `{date}` | today's date, locale `zh-CN` (e.g. `2026/3/3`) |

### HEARTBEAT_OK protocol

If the agent returns exactly `HEARTBEAT_OK` (trimmed), the output step is skipped silently. Use this when a task should only push when there is genuinely new content:

```
If nothing new to report, output exactly: HEARTBEAT_OK
```

## Local Skills

By default, all tasks load your locally installed Claude Code skills (`~/.claude/plugins/`, `~/.claude/skills/`) via `settingSources: ['user']`. This means any skill installed on your machine is available inside the agent's session.

To disable for a specific task (isolation, security):

```yaml
skills: false
```

## Environment Variables

```
ANTHROPIC_API_KEY=      # required
GITHUB_TOKEN=           # required for output: github (unless set per-task)
FEISHU_WEBHOOK=         # required for output: feishu (unless set per-task)
```

Copy `.env.example` to `.env`. A `.env` file in the current working directory is loaded automatically at startup.

## Timezone

All cron expressions run in `Asia/Shanghai` timezone. This is hardcoded in v0.1.

## Auto-start on macOS

To run `agent-cron start` as a background service that survives reboots:

```bash
# Create LaunchAgent plist
cat > ~/Library/LaunchAgents/com.agent-cron.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agent-cron</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npx</string>
    <string>@t0u9h/agent-cron</string>
    <string>start</string>
    <string>/path/to/your/tasks</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ANTHROPIC_API_KEY</key><string>sk-ant-...</string>
  </dict>
  <key>WorkingDirectory</key><string>/path/to/your/project</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/agent-cron.log</string>
  <key>StandardErrorPath</key><string>/tmp/agent-cron.error.log</string>
</dict>
</plist>
EOF

# Load immediately (no reboot required)
launchctl load ~/Library/LaunchAgents/com.agent-cron.plist

# Verify running
launchctl list | grep agent-cron
```

Or use the Claude Code skill — it handles all of this automatically.

## Architecture

```
tasks/*.md          →  loader.ts  →  runner.ts  →  AgentRunner  →  OutputChannel
                                                      (claude)      (file/feishu/github)
```

**Pluggable output channels** — implement `OutputChannel` and register in `src/outputs/index.ts`:

```typescript
interface OutputChannel {
  send(result: string, task: Task): Promise<void>
}
```

**Pluggable agent runners** — implement `AgentRunner` and register in `src/agents/index.ts`:

```typescript
interface AgentRunner {
  run(prompt: string, task: Task): Promise<string>
}
```

## Development

```bash
git clone https://github.com/T0UGH/agent-cron
cd agent-cron
npm install
npm test           # run tests (39 tests, node:test)
npm run build      # compile TypeScript → dist/
```
