---
name: AI News via Agent Reach
cron: "30 23 * * *"
skills: ["agent-reach"]
---

今天是 {date}。

请用 agent-reach 提供的工具，从多个平台搜索今日 AI 动态：

1. 用 Exa 搜索最新 AI 新闻（搜 "AI agent LLM news" 和 "Claude Gemini OpenAI latest"，各 5 条）
2. 在 GitHub 搜索今日热门 AI 项目（搜 "AI agent"，按 stars 排序，取前 5）
3. 在 Twitter 搜索 AI 相关热议（搜 "AI agent 2026"，取 10 条）

整理以上结果，按以下格式汇总：

# {date} AI 动态简报

## 🔥 今日热点
- [每条新闻一行，含来源链接]

## ⭐ GitHub 新项目
- [项目名]：[一句话介绍] — [链接]

## 💬 社区声音
- [有价值的观点，去掉转推噪音]

最后，执行以下步骤：

### 1. 写入 memory

将以上内容写入文件 `~/workspace/memory/ai-news/{date}.md`（目录不存在则创建）。

在 `~/workspace/memory` 目录下执行：
```
git add ai-news/{date}.md
git commit -m "chore: ai-news {date}"
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
      "text": "📰 AI 日报 {date}\n<3-5 条最值得关注的摘要，每条一行，控制在 200 字以内>\n\n详情：https://github.com/T0UGH/macmini-memory/blob/main/ai-news/{date}.md"
    }
  }'
```

将 text 中的摘要替换为实际内容。
