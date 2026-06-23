---
description: Start Tether mobile sync and run the phone↔agent loop for the current repo.
---

You are driving **Tether** so the developer can chat / review from their phone.
Read and follow `agent/SKILL.md` in the Tether repo. Use the `tether` CLI; do not
hand-roll HTTP.

Do this:

1. Run `tether start` from the repo root. Show the developer the printed
   **Server URL**, **6-digit pairing code**, and **QR code** verbatim so they can pair.
2. Dispatch ONE single-job waiting sub-agent whose entire task is to run:
   `tether wait --timeout 200`
   then return the printed JSON as plain text and exit. Do NOT poll `wait` yourself.
3. Block until the waiter returns. If it returns `{"messages":[],"timeout":true}`,
   immediately dispatch another waiter (same `--after` cursor). If it returns a
   message:
   - do the requested work / answer;
   - reply to the phone: `tether say --session <sessionId> --text "<your reply>"`;
   - acknowledge: `tether ack --ids <messageId>`;
   - dispatch the next waiter with `--after <messageId>`.
4. Keep the loop alive until the developer says stop, then run `tether stop`.

Rules: the main agent never polls `wait` directly — always delegate to a sub-agent
and block on it. One message per waiter. Always `ack` after handling. Keep phone
replies short and useful.
