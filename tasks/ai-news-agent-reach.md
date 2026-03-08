---
name: AI News via Agent Reach
cron: "0 9 * * *"
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

最后，将以上内容写入文件 `/Users/haha/workspace/github/agent-cron/output/ai-news-agent-reach-{date}.md`。
注意：文件名中的日期已经是 YYYY-MM-DD 格式（如 2026-03-07），直接使用，不要重新计算或修改格式。
