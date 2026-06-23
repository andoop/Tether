# Tether agent skill — drive Tether from any coding agent

This is the agent-facing companion to Tether. It explains how **any** coding agent
(Kiro, Cursor, Claude Code, Codex, or a plain LLM with shell access) drives the
mailbox loop so a developer can chat / confirm from their phone.

> The pattern mirrors a "single-job waiter": the **main agent** never polls; it
> dispatches **one** waiting worker that blocks for a single message, hands it
> back, and exits. The main agent processes, replies, acks, then dispatches the
> next waiter.

## CLI (no curl needed)

Run from the repo you want to expose:

| Command | What it does |
|---|---|
| `tether start` | Start the server; prints LAN URL + 6-digit pairing code + QR. |
| `tether sessions` | List session ids (no token; local). |
| `tether wait [--after <id>] [--timeout <s>]` | Block until the next phone message; print `{messages:[…]}` then exit. `--timeout 0` = forever. |
| `tether say --session <id> --text "<reply>" [--kind chat]` | Send an agent → phone message. |
| `tether ack --ids <id[,id…]>` | Acknowledge handled messages (removes them from the inbox). |
| `tether stop` | Stop the server and revoke device tokens. |

A mobile message looks like:

```json
{ "messages": [ { "id": "…-mobile-…", "source": "mobile", "kind": "chat",
                  "text": "what's the diff on auth.ts?", "sessionId": "sess_…" } ] }
```

## The loop the main agent runs

1. `tether start` → show the developer the URL + code + QR (so they can pair).
2. Dispatch **one** waiting sub-agent whose entire job is:
   `tether wait --timeout 200` → print the JSON → exit. (Use `--timeout 0` if your
   host allows unbounded sub-agents.)
3. When it returns a message: do the work, then
   `tether say --session <id> --text "<reply>"` and `tether ack --ids <id>`.
4. Dispatch the next waiter with `--after <lastId>`. Repeat until the developer
   says stop (then `tether stop`).

**Rules:** the main agent must NOT poll `wait` itself — always delegate it to a
sub-agent and block on it. One message per waiter. Always `ack` after handling.

## Tool wiring

- **Kiro**: copy [`prompts/tether-sync.md`](prompts/tether-sync.md) into `.kiro/prompts/`;
  trigger with `@tether-sync` or `/prompts tether-sync`. Dispatch the waiter with `invoke_sub_agent`.
- **Cursor / Claude Code**: copy `prompts/tether-sync.md` into `.cursor/commands/`
  (or `.claude/commands/`); trigger as `/tether-sync`. Dispatch the waiter with the Task tool.
- **Codex**: paste the body of `prompts/tether-sync.md` as a skill / message; dispatch a real sub-agent (not automation) for the waiter.
- **Any other agent**: just send the body of `prompts/tether-sync.md` as a normal message.

## What the phone can do

Chat, browse all repo files (read-only), and view `git status` / `git diff` — via
the phone web client (open the server URL in a mobile browser, enter the code) or
a native client built on the same HTTP API (see the project README).
