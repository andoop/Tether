# 安全策略

[English](SECURITY.md) | **中文**

Tether 在你的局域网上开放一个小型 HTTP 服务，使配对后的手机能与你的 coding agent 对话，
并**读取**仓库文件与 git diff。请像对待任何会打开本地网络端口的工具一样对待它。

## 威胁模型与保证

- 服务绑定 `0.0.0.0`（以便手机访问）。**仅在可信网络中运行。**
- 所有数据端点（`/sessions`、`/files`、`/git/*`、`/stream`）都需要一个**持久 device token**，
  该 token **只**在通过 `POST /pair` 正确认领配对码后签发。未认领/伪造的 token 返回 `401`。
- `POST /pair` 在多次失败后按**来源锁定**，且**绝不回显配对码**。
- 文件访问为**只读**（写操作 → `405`），具备路径穿越防护、密钥文件屏蔽、git 跟踪白名单，
  并排除 `.git/`、`node_modules/` 与运行时目录。
- `POST /stop` 吊销所有 device token。

## 已知限制（v0）

- QR device token 在 `/stop` 之前不会过期。
- 无 TLS（面向局域网，依赖你自己的网络边界）。
- 手机客户端 UI 不在本仓库。

## 报告漏洞

请通过 GitHub Security Advisories（Security 页的 “Report a vulnerability”）**私密**报告安全问题，
不要公开开 issue。我们力争 7 天内回应。
