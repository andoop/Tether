# Tether

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

## Quick start

```bash
npm install
npm start            # or: npx tsx src/index.ts start
```

This prints a **LAN URL**, a **6-digit pairing code**, and a **scannable QR code**.
On your phone, enter the URL + code (or scan) to pair. The server binds a free
port starting at `8770`.

```bash
npm test             # 36 tests
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

- The phone **app UI is not in this repo** — Tether currently ships the
  **server + protocol**; the mobile client is separate.
- The runtime dir is currently written under `mobile-bridge/.runtime` of the
  served repo (a naming artifact); to be renamed in a follow-up.
- CLI `--port` flag is not wired yet (auto-scans from `8770`).
- Optional MCP entrypoint and an automated SSE test are not yet implemented.
- QR device tokens do not expire until `/stop`.

## License

TBD.
