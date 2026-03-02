---
name: Example Task
cron: "0 9 * * *"
output: file
outputDir: ./output
---

Today is {date}.

Search for the latest news about AI coding tools and summarize in 3 bullet points.

If there is nothing interesting to report, output exactly: HEARTBEAT_OK
