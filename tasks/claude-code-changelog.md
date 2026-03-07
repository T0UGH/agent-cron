---
name: Claude Code Changelog
cron: "0 10 * * 1"
---

请用 WebSearch 搜索 Claude Code 最近的版本更新信息，获取最新的 10 个版本的更新日志。

搜索关键词：
- "Claude Code changelog"
- "Claude Code release notes"
- site:github.com/anthropics/claude-code releases

整理后按版本号从新到旧列出，每个版本包含：
- 版本号
- 发布日期
- 主要更新内容（简洁中文）

将整理好的内容写入文件 `~/.agent-cron/output/claude-code-changelog/{date}.md`（目录不存在则创建）。

如果找不到足够信息，输出：HEARTBEAT_OK
