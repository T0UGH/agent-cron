---
name: Daily AI Coding News
cron: "0 9 * * *"
output: file
---

今天是 {date}。

请用 WebSearch 分别搜索以下关键词，每个关键词都要搜索，获取最新的 AI coding 相关新闻：
- "Claude Code update {date}"
- "AI coding tools 2026"
- "Cursor IDE 2026"
- "v0 AI coding 2026"

整理搜索结果，筛选出真正值得关注的 AI 编程工具动态，以简洁的中文摘要输出。

如果没有值得推荐的新闻，输出：HEARTBEAT_OK
