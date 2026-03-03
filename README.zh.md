# agent-cron

> English docs: [README.md](./README.md)

用 Cron 定时运行 Claude Agent SDK 任务。任务是普通的 `.md` 文件 — 写好 Prompt、设置 Cron 表达式、选择输出渠道，就这些。

```
tasks/
  daily-ai-news.md    ← 每天早9点运行，发送到飞书
  weekly-report.md    ← 周一早8点运行，写入 GitHub
```

## 安装

```bash
npm install -g @t0u9h/agent-cron
# 或免安装直接使用
npx @t0u9h/agent-cron list
```

## Claude Code Skill

在 Claude Code 中用自然语言管理任务：

```bash
/claude install marketplace https://github.com/T0UGH/agent-cron/raw/main/.claude-plugin/marketplace.json
```

安装后可以直接说：
- "帮我创建一个每天早9点搜 AI 新闻发飞书的任务"
- "列出所有定时任务"
- "立即运行 daily-ai-news"
- "帮我配置 agent-cron 开机自启"

创建第一个任务时，Skill 会自动检测并配置 macOS 开机自启（launchd）。

## 快速开始

**1. 创建任务文件**

```bash
mkdir tasks
cat > tasks/daily-news.md << 'EOF'
---
name: Daily AI News
cron: "0 9 * * *"
output: file
outputDir: ./output
---

今天是 {date}。请搜索最新的 AI 编程工具新闻，总结成5条要点。

如果没有值得关注的新内容，直接输出：HEARTBEAT_OK
EOF
```

**2. 设置 API Key**

```bash
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY
```

**3. 先跑一次测试**

```bash
agent-cron run daily-news
```

**4. 启动调度器**

```bash
agent-cron start
```

## CLI 命令

```bash
agent-cron start              # 启动调度器（读取 ./tasks/，持续运行）
agent-cron start ./my-tasks   # 指定任务目录
agent-cron run                # 立即运行所有任务（一次性）
agent-cron run daily-news     # 立即运行指定任务
agent-cron list               # 列出所有已注册的任务及 Cron 表达式
```

`start` 是长驻进程。可以用 launchd（macOS）、systemd（Linux）或 pm2 保持它运行。

## 任务文件格式

每个任务是 tasks 目录下的一个 `.md` 文件：

```markdown
---
name: Daily AI News          # 显示名称（默认：文件名）
cron: "0 9 * * *"            # Cron 表达式（Asia/Shanghai 时区）
output: feishu               # 输出渠道：file | feishu | github
feishuWebhook: https://...   # 渠道专属配置（见下文）
---

今天是 {date}。请搜索最新的 AI 新闻……

如果没有值得关注的内容，直接输出：HEARTBEAT_OK
```

### Frontmatter 字段

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | 否 | 文件名 slug | 显示名称 |
| `cron` | **是** | — | 标准 5 段 Cron 表达式 |
| `output` | **是** | — | `file`、`feishu` 或 `github` |
| `agent` | 否 | `claude` | Agent 运行器（目前仅支持 `claude`） |
| `skills` | 否 | `true` | 加载 `~/.claude/` 本地 Skills（设为 `false` 可隔离） |

### 输出渠道配置

**`output: file`**

| 字段 | 必填 | 默认值 |
|------|------|--------|
| `outputDir` | 否 | `./output` |

写入 `{outputDir}/{slug}-{YYYY-MM-DD}.md`。

**`output: feishu`**

| 字段 | 必填 | 默认值 |
|------|------|--------|
| `feishuWebhook` | 否 | 环境变量 `FEISHU_WEBHOOK` |

将 Markdown 转换为飞书富文本（post 格式）发送。h1 标题作为卡片标题。

**`output: github`**

| 字段 | 必填 | 默认值 |
|------|------|--------|
| `githubRepo` | **是** | — |
| `githubBranch` | 否 | `main` |
| `githubDir` | 否 | 仓库根目录 |
| `githubToken` | 否 | 环境变量 `GITHUB_TOKEN` |

通过 GitHub Contents API 创建或更新 `{githubDir}/{slug}-{YYYY-MM-DD}.md`，无需本地 git 环境。

### 模板变量

| 变量 | 值 |
|------|----|
| `{date}` | 今天的日期，`zh-CN` 格式（例如 `2026/3/3`） |

### HEARTBEAT_OK 协议

如果 Agent 输出（去除首尾空白后）恰好等于 `HEARTBEAT_OK`，则跳过输出步骤，不产生任何文件或消息。适合那些"有新内容才推送"的任务：

```
如果没有值得关注的新内容，直接输出：HEARTBEAT_OK
```

## 本地 Skills

默认情况下，所有任务会通过 `settingSources: ['user']` 加载本机已安装的 Claude Code Skills（`~/.claude/plugins/`、`~/.claude/skills/`）。这意味着你机器上安装的任何 Skill 在 Agent 会话中都可用。

如需对特定任务隔离（安全或测试目的）：

```yaml
skills: false
```

## 环境变量

```
ANTHROPIC_API_KEY=      # 必填
GITHUB_TOKEN=           # output: github 时必填（也可在任务中单独设置）
FEISHU_WEBHOOK=         # output: feishu 时必填（也可在任务中单独设置）
```

将 `.env.example` 复制为 `.env`，启动时会自动加载当前工作目录下的 `.env` 文件。

## 时区

所有 Cron 表达式均在 `Asia/Shanghai` 时区运行，v0.1 中硬编码。

## macOS 开机自启

让 `agent-cron start` 以后台服务方式运行并在重启后自动恢复：

```bash
# 创建 LaunchAgent plist
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

# 立即加载（无需重启）
launchctl load ~/Library/LaunchAgents/com.agent-cron.plist

# 验证是否运行
launchctl list | grep agent-cron
```

或者直接用 Claude Code Skill，它会自动处理以上所有步骤。

## 架构

```
tasks/*.md  →  loader.ts  →  runner.ts  →  AgentRunner  →  OutputChannel
                                              (claude)      (file/feishu/github)
```

**可扩展的输出渠道** — 实现 `OutputChannel` 接口并在 `src/outputs/index.ts` 中注册：

```typescript
interface OutputChannel {
  send(result: string, task: Task): Promise<void>
}
```

**可扩展的 Agent 运行器** — 实现 `AgentRunner` 接口并在 `src/agents/index.ts` 中注册：

```typescript
interface AgentRunner {
  run(prompt: string, task: Task): Promise<string>
}
```

## 开发

```bash
git clone https://github.com/T0UGH/agent-cron
cd agent-cron
npm install
npm test           # 运行测试（39 个测试，node:test）
npm run build      # 编译 TypeScript → dist/
```
