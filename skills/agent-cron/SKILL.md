---
name: agent-cron
description: Use when user wants to manage agent-cron scheduled tasks: create a new scheduled task, list existing tasks, run a task immediately, or set up agent-cron as a macOS background service with auto-start on login. Triggers on phrases like "创建定时任务", "add a cron task", "列出任务", "list tasks", "run task", "立即运行", "开机自启", "setup agent-cron".
---

# agent-cron Skill

Manage `agent-cron` scheduled tasks from natural language.

`agent-cron` runs Claude Agent SDK tasks defined as `.md` files on a cron schedule. This skill covers four scenarios: **create**, **list**, **run**, **setup**.

---

## Branch 1 — Create a task

**Trigger:** User wants to create a new scheduled task (e.g. "帮我创建一个每天早上搜 AI 新闻发飞书的任务").

**Flow:**

1. Infer task intent from user's description.

2. Ask the user for schedule frequency if not clear (e.g. "每天早9点", "工作日8点", "每小时"). Convert to a cron expression using Asia/Shanghai timezone:
   - 每天早9点 → `0 9 * * *`
   - 工作日早8点 → `0 8 * * 1-5`
   - 每小时 → `0 * * * *`

3. Ask for output channel:
   - `file` → ask for `outputDir` (default `./output`)
   - `feishu` → ask for webhook URL, or confirm using `FEISHU_WEBHOOK` env var
   - `github` → ask for `githubRepo` (owner/repo), confirm `GITHUB_TOKEN` env var

4. Generate the task prompt body from user's description:
   - Include `今天是 {date}。` at the start
   - Include specific search keywords or instructions
   - End with: `如果没有值得关注的新内容，直接输出：HEARTBEAT_OK`

5. Infer a kebab-case slug from the task name (e.g. "daily-ai-news").

6. Write the file to `./tasks/<slug>.md`:

```markdown
---
name: <name>
cron: "<cron expression>"
output: <file|feishu|github>
<channel-specific fields>
---

<prompt body>
```

7. **Auto-check service:** Check if `~/Library/LaunchAgents/com.agent-cron.plist` exists:
   ```bash
   ls ~/Library/LaunchAgents/com.agent-cron.plist 2>/dev/null
   ```
   - **File not found** → Tell user: "检测到尚未配置自启动，帮你自动配置" → execute the **Setup** flow below immediately
   - **File exists** → Tell user: "agent-cron 已在运行，新任务将在下次触发时自动执行"

---

## Branch 2 — List tasks

**Trigger:** User wants to see existing tasks (e.g. "列出定时任务", "有哪些任务").

**Flow:**

Run:
```bash
npx @t0u9h/agent-cron list
```

Show the output to the user.

---

## Branch 3 — Run a task immediately

**Trigger:** User wants to run a task right now (e.g. "立即运行 daily-ai-news", "run the news task").

**Flow:**

1. If user specified a slug, run it directly:
   ```bash
   npx @t0u9h/agent-cron run <slug>
   ```

2. If no slug specified, first list tasks:
   ```bash
   npx @t0u9h/agent-cron list
   ```
   Then ask the user which task to run, then execute:
   ```bash
   npx @t0u9h/agent-cron run <slug>
   ```

---

## Branch 4 — Setup macOS auto-start

**Trigger:** User asks to configure auto-start (e.g. "帮我配置开机自启", "setup agent-cron service"), or triggered automatically after task creation when plist not found.

**Flow:**

1. Determine tasks directory. Ask user if not clear (default: `./tasks` in current working directory). Resolve to absolute path.

2. Get required values:
   ```bash
   echo $ANTHROPIC_API_KEY
   pwd
   which npx
   ```

3. Write `~/Library/LaunchAgents/com.agent-cron.plist` with the values from step 2:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agent-cron</string>
  <key>ProgramArguments</key>
  <array>
    <string>{npx_path}</string>
    <string>@t0u9h/agent-cron</string>
    <string>start</string>
    <string>{tasks_dir_absolute_path}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ANTHROPIC_API_KEY</key>
    <string>{ANTHROPIC_API_KEY}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>{cwd}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/agent-cron.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/agent-cron.error.log</string>
</dict>
</plist>
```

4. Load and start the service immediately:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.agent-cron.plist
   ```

5. Verify it's running:
   ```bash
   launchctl list | grep agent-cron
   ```
   Expected: a line with `com.agent-cron` and a PID (non-zero number in first column).

6. Confirm to user: "agent-cron 已启动并配置开机自启。日志: `/tmp/agent-cron.log`，错误日志: `/tmp/agent-cron.error.log`"
