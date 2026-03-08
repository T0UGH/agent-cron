#!/bin/zsh
# Load user environment
source ~/.zshrc 2>/dev/null

exec /Users/haha/.homebrew/opt/node@22/bin/node \
  /Users/haha/workspace/github/agent-cron/node_modules/.bin/tsx \
  /Users/haha/workspace/github/agent-cron/src/cli.ts \
  start \
  /Users/haha/workspace/github/agent-cron/tasks
