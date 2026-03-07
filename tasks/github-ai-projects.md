---
name: GitHub AI Projects Discovery
cron: "0 10 * * *"
output: file
---

今天是 {date}。

请帮我发现今天 GitHub 上最值得关注的 AI 相关项目。搜索以下关键词：
- "GitHub trending AI {date}"
- "GitHub new AI projects {date}"
- "awesome AI GitHub {date}"

整理出值得关注的项目，以简洁的中文摘要输出，包含项目名称、功能特点和使用方式。

如果没有值得推荐的项目，输出：HEARTBEAT_OK
