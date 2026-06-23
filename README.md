# Tether

[![CI](https://github.com/andoop/Tether/actions/workflows/ci.yml/badge.svg)](https://github.com/andoop/Tether/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** | [中文](README.zh-CN.md)

Tether is a tiny, agent-agnostic **phone companion for your coding agent**. Start it
in any repo, pair your phone, and from anywhere on your LAN you can:

- **Chat** with the agent driving your machine (messages flow through a file
  mailbox; the agent picks them up via a single-job waiting worker).
- **Browse all repo files** (read-only).
- **View `git status` / `git diff`** of the working tree.

No "project" or session binding required — start it anytime, like having a
Codex-app-style window into whatever repo you're in.

> Tether was built using the [Sandtable](https://github.com/andoop/sandtable)
> sandtable-driven workflow; Sandtable is only the methodology — it is not a
> runtime dependency of Tether.

## Who uses it (three roles)

1. **The developer** runs `tether start` in a repo.
2. **The agent** (any coding agent) drives the phone↔agent loop via the `tether`
   CLI — see [agent/SKILL.md](agent/SKILL.md). No HTTP hand-rolling.
3. **The phone user** opens the printed URL in a mobile browser (or scans the QR),
   enters the 6-digit code, and gets a **zero-install web app**: chat, file
   browser, and git diff.

## Quick start

```bash
npm install
npm start            # or: npx tsx src/index.ts start
```

This prints a **LAN URL**, a **6-digit pairing code**, and a **scannable QR code**.
On your phone, open the URL in a browser (or scan the QR to open it), then enter
the 6-digit code to pair — no app install required. The server binds a free port
starting at `8770`.

Drive it from an agent (see [agent/SKILL.md](agent/SKILL.md)):

```bash
tether start                              # print URL + code + QR
tether sessions                           # list session ids
tether wait --timeout 200                 # waiter: block for next phone message
tether say --session <id> --text "done"   # reply to the phone
tether ack --ids <messageId>              # acknowledge a handled message
tether stop                               # stop + revoke device tokens
```

```bash
npm test             # 43 tests
npm run typecheck
npm run build        # emits dist/
```

## Security model (read before exposing)

- The server binds to `0.0.0.0` so your phone can reach it — **run it only on
  trusted networks.**
- All data endpoints (`/sessions`, `/files`, `/git/*`) require a **durable device
  token** that is issued **only** after a correct pairing code is claimed via
  `POST /pair`. An unclaimed/forged token gets `401`.
- `POST /pair` enforces **per-source lockout** after repeated failures and never
  echoes the pairing code.
- File browsing is **read-only** (writes → `405`) with:
  - path-traversal protection (`..`, absolute paths, symlink escape rejected),
  - secret masking (`.env`, `*.pem`, `*.key`, `id_*`, `*.npmrc`, `credentials*`, …),
  - a git-tracked allow-set (`.gitignore`d files are not served),
  - `.git/`, `node_modules/`, and the runtime dir always excluded.
- `POST /stop` revokes all device tokens.

## HTTP surface (token required unless noted)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | open |
| POST | `/pair` | `{code}` → `{token, sessions}`; only network path to a token |
| GET | `/sessions`, `/sessions/:id/messages` | |
| POST | `/sessions/:id/messages` | phone → agent (`{text, kind}`) |
| GET | `/files?path=`, `/files/content?path=` | read-only |
| GET | `/git/status`, `/git/diff` | non-git repo → `{ok:false}` |
| GET | `/stream` | SSE (best-effort) |
| POST | `/agent/messages`, `/mailbox/inbox`, `/mailbox/inbox/ack`, `/stop` | host/loopback |

## Status & known limitations (v0)

- Ships a **zero-install web client** (served at `/`). A native mobile app is an
  optional future track built on the same HTTP API.
- CLI `--port` flag is not wired yet (auto-scans from `8770`).
- Optional MCP entrypoint and an automated SSE test are not yet implemented.
- QR / device tokens do not expire until `/stop`.
- Runtime state is stored in `.tether/` of the served repo (git-ignored).

## License

[MIT](LICENSE) © andoop
