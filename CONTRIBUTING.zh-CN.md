# 为 Tether 做贡献

[English](CONTRIBUTING.md) | **中文**

感谢你的关注！Tether 是一个小而专注的项目——欢迎那些保持外科手术式改动、带好测试的贡献。

## 开发环境

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # 产出 dist/
npm start         # 本地运行 CLI
```

需要 Node.js >= 20。

## 基本原则

- **改动要外科手术式。** 一个 PR 只做一件事；不要顺手做无关重构。
- **必须带测试。** 新行为或缺陷修复都要配测试。保持测试全绿（`npm test`）、类型干净（`npm run typecheck`）。
- **安全优先。** 任何触及配对、token、文件访问或 git 命令执行的改动，都必须保持
  [SECURITY.md](SECURITY.zh-CN.md) 中的保证：文件只读、路径穿越防护、密钥屏蔽、device token 鉴权、
  按来源锁定。为安全相关路径补测试。
- **不引入新的运行时依赖**，除非先在 issue 中讨论。

## Pull Request

1. 从 `main` fork 并新建分支。
2. 带测试完成你的改动。
3. 确保 `npm test`、`npm run typecheck`、`npm run build` 通过（CI 会跑这些）。
4. 提交 PR，说明改了什么、为什么、怎么测的。

## 提交信息

推荐使用 Conventional Commits（如 `feat:`、`fix:`、`chore:`、`docs:`）。
