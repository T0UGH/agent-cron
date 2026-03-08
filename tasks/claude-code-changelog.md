---
name: Claude Code Changelog
cron: "0 0 * * *"
---

今天是 {date}。

请用 WebSearch 搜索 Claude Code 最近的版本更新信息，重点找**今天或近 2 天内**发布的新版本。

搜索关键词：
- "Claude Code changelog"
- "Claude Code release notes"
- site:github.com/anthropics/claude-code releases

## 判断逻辑

如果**没有**今天或近 2 天内的新版本，直接输出：HEARTBEAT_OK

如果**有**新版本，执行以下步骤：

### 1. 整理内容

按版本号从新到旧列出新版本，每个版本包含：
- 版本号
- 发布日期
- 主要更新内容（简洁中文）

### 2. 写入 memory

将整理好的内容追加写入文件 `~/workspace/memory/claude-code-changelog/{date}.md`（目录不存在则创建）。

在 `~/workspace/memory` 目录下执行：
```
git add claude-code-changelog/{date}.md
git commit -m "chore: claude-code-changelog {date}"
git push
```

### 3. 发飞书通知

用以下命令发送飞书通知（FEISHU_WEBHOOK 已在环境变量中）：

```bash
curl -X POST "$FEISHU_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{
    "msg_type": "text",
    "content": {
      "text": "🚀 Claude Code 有新版本！\n<在此填入版本号和核心更新内容，控制在 200 字以内>"
    }
  }'
```

将 text 内容替换为实际的版本号和核心更新摘要。
