# agent-cron

> 中文文档：[README.zh.md](./README.zh.md)

Run Claude Agent SDK tasks on a cron schedule. Tasks are plain `.md` files — write a prompt, set a cron expression. That's it.

```
tasks/
  daily-ai-news.md          ← runs at 9am daily
  claude-code-changelog.md  ← runs at 10am daily, sends Feishu notification
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

## Quick Start

**1. Create a task file**

```bash
mkdir tasks
cat > tasks/daily-news.md << 'EOF'
---
name: Daily AI News
cron: "0 9 * * *"
---

Today is {date}. Search for the latest AI coding news and summarize in 5 bullet points.

If nothing new, output exactly: HEARTBEAT_OK
EOF
```

**2. Set your API key**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
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
agent-cron status             # show last run status for all tasks
agent-cron logs <slug>        # show today's log for a task
agent-cron logs <slug> <date> # show log for a specific date (YYYY-MM-DD)
```

`start` is a long-running process. Use [launchd](#auto-start-on-macos) (macOS), systemd (Linux), or pm2 to keep it running.

### status

Shows a quick overview of all task runs:

```
$ agent-cron status

TASK                       LAST RUN       STATUS      DURATION
--------------------------------------------------------------
claude-code-changelog      今天 10:00     heartbeat   12s
daily-ai-news              今天 09:00     ok          45s
github-ai-projects         今天 10:00     error ⚠     3s
                                          ↳ Claude Code process exited with code 1
```

### logs

Prints the structured log for a task. Falls back to the most recent log if today has none.

```
$ agent-cron logs daily-ai-news

[2026-03-07 09:00:01.123] [START] task=daily-ai-news
[2026-03-07 09:00:03.456] [TOOL]  name=web_search input={"query":"AI coding news"}
[2026-03-07 09:00:10.000] [END]   status=ok duration=8877ms
```

## Task File Format

Each task is a `.md` file in your tasks directory:

```markdown
---
name: Daily AI News          # display name (default: filename slug)
cron: "0 9 * * *"            # cron expression (Asia/Shanghai timezone)
agent: claude                # agent runner (default: claude)
skills: true                 # load ~/.claude/ skills (set false to isolate)
---

Today is {date}. Search for the latest AI news...

If nothing to report, output exactly: HEARTBEAT_OK
```

### Frontmatter fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | no | filename slug | display name |
| `cron` | **yes** | — | standard 5-field cron expression |
| `agent` | no | `claude` | agent runner (`claude` or `shell`) |
| `skills` | no | `true` | load `~/.claude/` skills, or `["skill-name"]` for specific ones |

### Template variables

| Variable | Value |
|----------|-------|
| `{date}` | today's date in `YYYY-MM-DD` format (e.g. `2026-03-07`) |

### Prompt-driven output

There is no built-in output channel system. Instead, write the output logic directly in your prompt — Claude will execute it. This is more flexible than any abstraction:

````markdown
---
name: Claude Code Changelog
cron: "0 10 * * *"
---

Search for Claude Code release notes...

If new version found:

1. Write summary to `~/workspace/memory/changelog/{date}.md`
2. Git commit and push
3. Send Feishu notification:
```bash
curl -X POST "$FEISHU_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{"msg_type":"text","content":{"text":"New version found!"}}'
```

If nothing new, output: HEARTBEAT_OK
````

### HEARTBEAT_OK protocol

If the agent returns exactly `HEARTBEAT_OK` (trimmed), the task is considered a no-op — logged as `heartbeat` status. Use this when a task should only act when there is genuinely new content.

## Local Skills

By default, all tasks load your locally installed Claude Code skills (`~/.claude/plugins/`, `~/.claude/skills/`). To load specific skills only:

```yaml
skills: ["agent-reach", "my-skill"]
```

To disable for a specific task (isolation):

```yaml
skills: false
```

## Environment Variables

```
ANTHROPIC_API_KEY=      # required
```

A `.env` file in the current working directory is loaded automatically at startup.

## Timezone

All cron expressions run in `Asia/Shanghai` timezone.

## Logging

Each task run writes structured events to `~/.agent-cron/logs/<slug>/YYYY-MM-DD.log`:

- `[START]` — task begins
- `[TOOL]` — each agent tool call (name, input, truncated output)
- `[END]` — task ends with status (`ok`, `heartbeat`, or `error`) and duration

Use `agent-cron status` and `agent-cron logs <slug>` to inspect.

## Auto-start on macOS

Create a shell wrapper that loads your environment:

```bash
cat > /path/to/agent-cron/start.sh << 'EOF'
#!/bin/zsh
source ~/.zshrc 2>/dev/null
exec node /path/to/agent-cron/node_modules/.bin/tsx \
  /path/to/agent-cron/src/cli.ts start /path/to/tasks
EOF
chmod +x /path/to/agent-cron/start.sh
```

Then create the LaunchAgent:

```bash
cat > ~/Library/LaunchAgents/com.agent-cron.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agent-cron</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>/path/to/agent-cron/start.sh</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/agent-cron</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/agent-cron.log</string>
  <key>StandardErrorPath</key><string>/tmp/agent-cron.error.log</string>
</dict>
</plist>
EOF

# Load immediately
launchctl load ~/Library/LaunchAgents/com.agent-cron.plist

# Verify
launchctl list | grep agent-cron
```

The shell wrapper (`start.sh`) ensures environment variables like `ANTHROPIC_API_KEY` are available — launchd does not inherit your shell environment.

Or use the Claude Code skill — it handles all of this automatically.

## Architecture

```
tasks/*.md  →  loader.ts  →  scheduler.ts  →  runner.ts  →  AgentRunner  →  Logger
                                                               agents/       ~/.agent-cron/logs/
```

**Pluggable agent runners** — implement `AgentRunner` and register in `src/agents/index.ts`:

```typescript
interface AgentRunner {
  run(prompt: string, task: Task, logger?: Logger): Promise<string>
}
```

## Development

```bash
git clone https://github.com/T0UGH/agent-cron
cd agent-cron
npm install
npm test           # run tests (node:test)
npm run build      # compile TypeScript → dist/
```
