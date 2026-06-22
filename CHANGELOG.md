# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-06-22

### Added
- No-campaign mobile companion server (Node + TypeScript + Fastify).
- Pairing: 6-digit code + durable device tokens, per-source lockout, QR pairing.
- Read-only file browsing: path-traversal protection, secret masking, git-tracked
  allow-list, runtime/`.git`/`node_modules` exclusion.
- `git status` / `git diff` endpoints with non-git degradation.
- File-mailbox chat loop (phone ↔ agent) with single-job waiting worker.
- Feature-optional sessions; SSE stream.
- 36 vitest tests; typecheck-clean.

[Unreleased]: https://github.com/andoop/Tether/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/andoop/Tether/releases/tag/v0.1.0
