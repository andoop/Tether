# Tether

[![CI](https://github.com/andoop/Tether/actions/workflows/ci.yml/badge.svg)](https://github.com/andoop/Tether/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | **中文**

Tether 是一个轻量、与 agent 无关的**手机伴侣**，服务于你的 coding agent。在任意仓库里启动它，
手机配对后，你就能在同一局域网内随时：

- **对话**：和正在驱动你电脑的 agent 聊天（消息经文件信箱传递，agent 由一个单职责等待子进程取信）。
- **浏览全部仓库文件**（只读）。
- **查看工作树的 `git status` / `git diff`**。

无需绑定任何“项目/会话”——随时开启，就像拥有一个 Codex App 风格的窗口，看进你当前所在的仓库。

> Tether 使用 [Sandtable](https://github.com/andoop/sandtable) 沙盘推演驱动开发流程构建；
> Sandtable 只是方法论，**不是** Tether 的运行时依赖。

## 快速开始

```bash
npm install
npm start            # 或：npx tsx src/index.ts start
```

它会打印一个**局域网 URL**、一个**6 位配对码**和一个**可扫描的二维码**。
在手机上输入 URL + 配对码（或扫码）即可配对。服务从 `8770` 起选用空闲端口。

```bash
npm test             # 36 个测试
npm run typecheck
npm run build        # 产出 dist/
```

## 安全模型（暴露前必读）

- 服务绑定 `0.0.0.0` 以便手机访问——**仅在可信网络中运行。**
- 所有数据端点（`/sessions`、`/files`、`/git/*`）都需要一个**持久 device token**，
  该 token **只**在通过 `POST /pair` 正确认领配对码后才签发。未认领/伪造的 token 返回 `401`。
- `POST /pair` 在多次失败后按**来源（IP）锁定**，且响应**绝不回显配对码**。
- 文件浏览为**只读**（写操作 → `405`），并具备：
  - 路径穿越防护（拒绝 `..`、绝对路径、符号链接逃逸）；
  - 密钥屏蔽（`.env`、`*.pem`、`*.key`、`id_*`、`*.npmrc`、`credentials*` 等）；
  - git 跟踪白名单（被 `.gitignore` 忽略的文件不提供）；
  - 始终排除 `.git/`、`node_modules/` 与运行时目录。
- `POST /stop` 吊销所有 device token。

## HTTP 接口（除注明外均需 token）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 开放 |
| POST | `/pair` | `{code}` → `{token, sessions}`；网络上获取 token 的唯一途径 |
| GET | `/sessions`、`/sessions/:id/messages` | |
| POST | `/sessions/:id/messages` | 手机 → agent（`{text, kind}`） |
| GET | `/files?path=`、`/files/content?path=` | 只读 |
| GET | `/git/status`、`/git/diff` | 非 git 仓库 → `{ok:false}` |
| GET | `/stream` | SSE（尽力推送） |
| POST | `/agent/messages`、`/mailbox/inbox`、`/mailbox/inbox/ack`、`/stop` | 本机/loopback |

## 现状与已知限制（v0）

- 手机**端 App UI 不在本仓库**——Tether 目前交付**服务端 + 协议**，移动客户端单独提供。
- 运行时目录当前写在所服务仓库的 `mobile-bridge/.runtime` 下（命名遗留），后续会重命名。
- CLI `--port` 参数尚未接线（从 `8770` 起自动扫描端口）。
- 可选的 MCP 入口与 SSE 的自动化测试尚未实现。
- QR device token 在 `/stop` 之前不会过期。

## 许可证

[MIT](LICENSE) © andoop
