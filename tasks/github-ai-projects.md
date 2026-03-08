---
name: GitHub AI Projects Discovery
cron: "5 10 * * *"
---

今天是 {date}。

请帮我发现今天 GitHub 上最值得关注的 AI 相关项目。搜索以下关键词：
- "GitHub trending AI {date}"
- "GitHub new AI projects {date}"
- "awesome AI GitHub {date}"

整理出值得关注的项目，以简洁的中文摘要输出，包含项目名称、功能特点和使用方式。

如果没有值得推荐的项目，输出：HEARTBEAT_OK

如果有值得推荐的项目，执行以下步骤：

### 1. 写入 memory

将内容写入文件 `~/workspace/memory/github-ai-projects/{date}.md`（目录不存在则创建）。

在 `~/workspace/memory` 目录下执行：
```
git add github-ai-projects/{date}.md
git commit -m "chore: github-ai-projects {date}"
git push
```

### 2. 发飞书通知

用以下命令发送飞书通知（FEISHU_WEBHOOK 已在环境变量中）：

```bash
curl -X POST "$FEISHU_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{
    "msg_type": "text",
    "content": {
      "text": "⭐ GitHub AI 项目 {date}\n<3-5 个最值得关注的项目，每个一行，控制在 200 字以内>\n\n详情：https://github.com/T0UGH/macmini-memory/blob/main/github-ai-projects/{date}.md"
    }
  }'
```

将 text 中的摘要替换为实际内容。
