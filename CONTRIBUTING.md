# Contributing to Tether

**English** | [中文](CONTRIBUTING.zh-CN.md)

Thanks for your interest! Tether is a small, focused project — contributions that
keep it surgical and well-tested are very welcome.

## Development setup

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # emit dist/
npm start         # run the CLI locally
```

Requires Node.js >= 20.

## Ground rules

- **Keep changes surgical.** One logical change per PR; avoid unrelated refactors.
- **Tests required.** New behavior or bug fixes must come with tests. Keep the
  suite green (`npm test`) and types clean (`npm run typecheck`).
- **Security first.** Anything touching pairing, tokens, file access, or git
  command execution must preserve the guarantees in [SECURITY.md](SECURITY.md):
  read-only file access, path-traversal protection, secret masking, device-token
  auth, per-source lockout. Add tests for the security-relevant path.
- **No new runtime dependencies** without discussion in an issue first.

## Pull requests

1. Fork and branch from `main`.
2. Make your change with tests.
3. Ensure `npm test`, `npm run typecheck`, and `npm run build` pass (CI runs these).
4. Open a PR describing what changed, why, and how you tested it.

## Commit messages

Conventional Commits are appreciated (e.g. `feat:`, `fix:`, `chore:`, `docs:`).
