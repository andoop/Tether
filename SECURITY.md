# Security Policy

**English** | [中文](SECURITY.zh-CN.md)

Tether exposes a small HTTP server on your LAN so a paired phone can chat with
your coding agent and **read** repository files and git diffs. Treat it like any
tool that opens a local network port.

## Threat model & guarantees

- The server binds `0.0.0.0` (so phones can reach it). **Run it only on trusted
  networks.**
- All data endpoints (`/sessions`, `/files`, `/git/*`, `/stream`) require a
  **durable device token** that is issued **only** after a correct pairing code is
  claimed via `POST /pair`. Unclaimed/forged tokens receive `401`.
- `POST /pair` enforces **per-source lockout** after repeated failures and never
  echoes the pairing code.
- File access is **read-only** (writes → `405`), with path-traversal protection,
  secret-file masking, a git-tracked allow-list, and exclusion of `.git/`,
  `node_modules/`, and the runtime directory.
- `POST /stop` revokes all device tokens.

## Known limitations (v0)

- QR device tokens do not expire until `/stop`.
- No TLS (intended for LAN use behind your own network boundary).
- The phone client UI lives outside this repo.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories
("Report a vulnerability" on the Security tab) rather than opening a public
issue. We aim to acknowledge reports within 7 days.
