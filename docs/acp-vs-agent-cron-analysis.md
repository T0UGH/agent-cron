# 为什么用 Claude Agent SDK + Cron，而不是 ACP

> 写于 2026-03-07，基于对 ACP 和 Claude Agent SDK 的调研。

---

## 背景：三种"让 AI Agent 定时干活"的思路

当你想定时让一个 AI Agent 执行任务时，大致有三条路：

1. **ACP（Agent Client Protocol）** — Zed 发布的编辑器↔Agent 通信协议
2. **Claude Code headless + cron** — 直接用 `claude --print -p "..."` 套系统 cron
3. **Claude Agent SDK + cron** — 用 SDK 编程调度，输出到任意 channel

agent-cron 选择了第三条。这篇文档解释原因。

---

## ACP 是什么，它适合做什么

ACP（Agent Client Protocol）是 Zed Industries 在 2025 年 8 月发布的开放协议，底层是 JSON-RPC 2.0。

它的设计目标是：**让任意 Agent 接入任意编辑器 UI**，类比 LSP（Language Server Protocol）把语言智能从 IDE 解耦出来。

```
编辑器（Zed / Neovim / Emacs）
        ↕  ACP (JSON-RPC 2.0)
  Agent（Claude Code / Gemini CLI / Kiro CLI）
```

目前 ACP 已经被以下编辑器支持：
- Zed（官方，Claude Code / Gemini CLI）
- Neovim（CodeCompanion、avante.nvim）
- Emacs（agent-shell）
- marimo notebook

**ACP 擅长的是**：实时、交互式、有 UI 的编辑器内 Agent 操作。

---

## ACP 不适合做定时任务的原因

### 1. 协议设计假设有编辑器进程存在

ACP 是 client-server 架构，client 是编辑器。定时任务的场景下没有编辑器进程在跑，你需要自己实现一个 ACP client，然后管理 Agent 进程的生命周期。这是在解决 ACP 没打算解决的问题。

### 2. 社区的 headless ACP 方案还在 alpha

社区确实有人造了 `acpx`（headless CLI client for ACP），支持 persistent sessions 和 prompt queueing。但截至 2026 年初，它仍然是 alpha，接口随时会变，不适合生产调度。

### 3. ACP 的输出回到编辑器 UI，不适合无人值守

ACP 的设计是"把结果返回给编辑器 UI"——有人在看。定时任务是无人值守的，结果需要写到文件、发 webhook、推 GitHub，这些都在 ACP 协议之外。

相比之下，Claude Agent SDK 里的 Agent 本身就有 bash/write 工具，可以直接在 prompt 里指定输出目标，不需要任何额外的路由层。

---

## Claude Agent SDK + Cron：agent-cron 的选择

### 核心判断

**定时任务不需要编辑器协议，需要的是：**
- 可靠地触发 Agent 执行
- 任务配置简单易维护
- Agent 自己决定如何输出（写文件、发 webhook、调 API）

Claude Agent SDK 提供 Agent 执行能力，node-cron 负责调度，输出完全交给 Agent 自己处理。

### 架构对比

| | ACP + acpx | Claude Agent SDK + cron |
|---|---|---|
| 稳定性 | alpha | 生产可用 |
| 编辑器依赖 | 需要（或自建 client） | 无 |
| 输出方式 | 需自建路由 | Agent 用工具自行输出 |
| 任务配置 | 无标准格式 | `.md` frontmatter |
| headless 支持 | 有但不成熟 | 原生支持 |

### agent-cron 的方案

```
tasks/*.md  →  node-cron  →  Claude Agent SDK  →  Agent 自行输出
                                                   （写文件 / 发飞书 / 推 GitHub）
```

任务是纯 `.md` 文件，frontmatter 只声明调度时间，**输出逻辑写在 prompt 里**，Agent 用自带的 bash/write 工具执行。整个进程用 launchd / systemd 托管。

没有编辑器，没有协议，没有输出 channel 抽象——就是一个长跑进程 + 一堆 markdown 文件。

### 本地 Skills 在定时任务里同样可用

这是一个容易被忽视的优势：**你在 `~/.claude/skills/` 下装的所有 skill，在 agent-cron 任务里都能用**。

SDK 提供了两个加载路径：

| task 配置 | 行为 |
|-----------|------|
| `skills: true`（默认） | `settingSources: ['user']`，加载所有用户级 skill |
| `skills: ["agent-reach"]` | 从 `~/.claude/skills/agent-reach/` 复制到临时目录，通过 `plugins` 注入 |
| `skills: false` | 完全隔离，不加载任何 skill |

实际效果：如果你装了 `agent-reach`（能搜 Twitter、小红书、YouTube、Reddit 等），定时任务里直接能用：

```yaml
---
name: Weekly Tech Digest
cron: "0 9 * * 1"
skills: ["agent-reach"]
---

搜索本周 GitHub 上星数增长最快的 AI 项目，
整理成简报，写入 ~/reports/weekly-{date}.md。
```

ACP 方案里，headless 调用时 skill 的加载是个未解决的问题。agent-cron 直接复用了 Claude Code 的 skill 生态。

---

## 什么时候应该考虑 ACP

如果你的需求是：
- 在编辑器里实时与 Agent 交互
- 想让同一个 Agent 既能被 Zed 调用，也能被 Neovim 调用
- 构建一个面向编辑器生态的 Agent 产品

那 ACP 是正确的选择。它正在成为编辑器 AI 集成的标准协议，类比 LSP 在语言支持上的地位。

但如果你的需求是定时、无人值守、Agent 自主完成输出，ACP 是错误的工具。

---

## 结论

agent-cron 的定位是**无头调度器**，不是编辑器插件。Claude Agent SDK 给了我们直接控制 Agent 执行的能力，node-cron 负责调度，输出由 Agent 自己通过工具完成——写文件、发 webhook、推 GitHub 都行，不需要框架层的 channel 抽象。这个组合比 ACP 更直接、更稳定、更适合这个场景。

ACP 和 agent-cron 不是竞争关系——一个是编辑器协议，一个是调度框架。理论上 agent-cron 未来也可以实现一个 ACP server，让编辑器能触发 agent-cron 里定义的任务，但那是另一个话题了。
