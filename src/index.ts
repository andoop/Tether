#!/usr/bin/env node
import os from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaths, type RuntimePaths } from "./paths.js";
import { PairingRegistry } from "./pairing.js";
import { DeviceStore } from "./devices.js";
import { createServer } from "./server.js";
import { renderQr } from "./qr.js";
import { listSessions } from "./sessions.js";

const DEFAULT_PORT = 8770;
const MAX_PORT_SCAN = 50;
const POLL_INTERVAL_MS = 3000;

interface ServerInfo {
  url: string;
  port: number;
  pid: number;
}

function lanAddress(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

function serverInfoFile(paths: RuntimePaths): string {
  return path.join(paths.runtimeRoot, "server.json");
}

/** Persist { url, port, pid } so other CLI invocations can find the running server. */
async function writeServerInfo(paths: RuntimePaths, info: ServerInfo): Promise<void> {
  await fs.mkdir(paths.runtimeRoot, { recursive: true });
  await fs.writeFile(serverInfoFile(paths), `${JSON.stringify(info, null, 2)}\n`, "utf8");
}

/**
 * Read server.json to discover the running server. The CLI subcommands talk to
 * the LOCAL server over loopback, so we rewrite the host to 127.0.0.1 (the
 * persisted url is the LAN address used for pairing).
 */
async function readBaseUrl(paths: RuntimePaths): Promise<string> {
  let info: ServerInfo;
  try {
    const raw = await fs.readFile(serverInfoFile(paths), "utf8");
    info = JSON.parse(raw) as ServerInfo;
  } catch {
    throw new Error("tether is not running; run: tether start");
  }
  if (!info || typeof info.port !== "number") {
    throw new Error("tether is not running; run: tether start");
  }
  return `http://127.0.0.1:${info.port}`;
}

async function listenWithScan(app: Awaited<ReturnType<typeof createServer>>, start: number): Promise<number> {
  let port = start;
  for (let i = 0; i < MAX_PORT_SCAN; i += 1) {
    try {
      await app.listen({ host: "0.0.0.0", port });
      return port;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "EADDRINUSE") {
        port += 1;
        continue;
      }
      throw e;
    }
  }
  throw new Error(`no free port found in range ${start}-${start + MAX_PORT_SCAN}`);
}

async function start(): Promise<void> {
  // repoRoot is the current working directory. We deliberately do NOT read
  // docs/sandtable or runtime/server -- this service is fully decoupled.
  const repoRoot = process.cwd();
  const paths = resolvePaths(repoRoot);

  const pairing = new PairingRegistry();
  const devices = await new DeviceStore(paths.devicesFile).load();
  const app = await createServer(paths, { pairing, devices });

  const port = await listenWithScan(app, DEFAULT_PORT);
  const url = `http://${lanAddress()}:${port}`;

  // Persist server info so other CLI invocations (wait/say/ack/stop) find us.
  await writeServerInfo(paths, { url, port, pid: process.pid });

  // PIN is minted IN-PROCESS and only printed to the terminal. The QR encodes the
  // plain web URL so scanning opens the phone web client; the 6-digit code is still
  // required to pair (no token travels in the QR).
  const { code } = pairing.createPin();
  const qr = await renderQr(url);

  process.stdout.write("\nTether is running.\n");
  process.stdout.write(`  URL:          ${url}\n`);
  process.stdout.write(`  Open on phone: ${url}  (or scan below), then enter the code\n`);
  process.stdout.write(`  Pairing code: ${code}  (expires in 10 min)\n`);
  process.stdout.write("  Scan to open the web client:\n");
  process.stdout.write(`${qr}\n`);
  process.stdout.write(
    "  SECURITY: this binds to 0.0.0.0 (LAN). Only run on trusted networks.\n" +
      "            Anyone with the pairing code can browse files (read-only) and git diff.\n\n"
  );

  const shutdown = () => {
    app.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

/**
 * `tether wait [--after <id>] [--timeout <seconds>]`
 * Poll the local inbox every 3s until at least one message appears, then print
 * {messages:[...]} and exit. timeout=0 (default) waits forever; a positive
 * timeout prints {"messages":[],"timeout":true} when exceeded.
 */
async function wait(flags: Record<string, string | boolean>): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const base = await readBaseUrl(paths);
  const after = typeof flags.after === "string" ? flags.after : "";
  const timeoutSec = typeof flags.timeout === "string" ? Number(flags.timeout) : 0;
  const deadline = timeoutSec > 0 ? Date.now() + timeoutSec * 1000 : 0;

  for (;;) {
    const qs = after ? `?after=${encodeURIComponent(after)}` : "";
    const res = await fetch(`${base}/mailbox/inbox${qs}`);
    const body = (await res.json()) as { messages?: Array<{ id: string }> };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length > 0) {
      process.stdout.write(`${JSON.stringify({ messages })}\n`);
      return;
    }
    if (deadline && Date.now() >= deadline) {
      process.stdout.write(`${JSON.stringify({ messages: [], timeout: true })}\n`);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** `tether say --session <id> --text <text> [--kind chat]` */
async function say(flags: Record<string, string | boolean>): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const base = await readBaseUrl(paths);
  const sessionId = typeof flags.session === "string" ? flags.session : "";
  const text = typeof flags.text === "string" ? flags.text : "";
  const kind = typeof flags.kind === "string" ? flags.kind : "chat";
  if (!sessionId) throw new Error("--session <id> is required");
  const res = await fetch(`${base}/agent/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, text, kind })
  });
  const body = await res.json();
  process.stdout.write(`${JSON.stringify(body)}\n`);
}

/** `tether ack --ids <id[,id...]>` */
async function ack(flags: Record<string, string | boolean>): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const base = await readBaseUrl(paths);
  const raw = typeof flags.ids === "string" ? flags.ids : "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const res = await fetch(`${base}/mailbox/inbox/ack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids })
  });
  const body = await res.json();
  process.stdout.write(`${JSON.stringify(body)}\n`);
}

/** `tether stop` */
async function stop(): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const base = await readBaseUrl(paths);
  const res = await fetch(`${base}/stop`, { method: "POST" });
  const body = await res.json();
  process.stdout.write(`${JSON.stringify(body)}\n`);
}

/**
 * `tether sessions` — read the local sessions store directly (no token needed)
 * so an agent can discover session ids without pairing.
 */
async function sessions(): Promise<void> {
  const paths = resolvePaths(process.cwd());
  const list = await listSessions(paths);
  process.stdout.write(`${JSON.stringify({ sessions: list })}\n`);
}

function usage(): void {
  process.stdout.write(
    "tether — phone remote companion (chat + read-only file browse + git diff)\n\n" +
      "Usage:\n" +
      "  tether start                                 Start the service; print pairing code + URL + QR\n" +
      "  tether wait [--after <id>] [--timeout <s>]   Block until a mailbox message arrives, print {messages:[...]}\n" +
      "  tether say --session <id> --text <text> [--kind chat]\n" +
      "                                               Send an agent message to a session\n" +
      "  tether ack --ids <id[,id...]>                Acknowledge (mark processed) inbox messages\n" +
      "  tether sessions                              List known session ids (local store, no token)\n" +
      "  tether stop                                  Stop the running service\n"
  );
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const flags = parseFlags(process.argv.slice(3));
  switch (cmd) {
    case "start":
      await start();
      break;
    case "wait":
      await wait(flags);
      break;
    case "say":
      await say(flags);
      break;
    case "ack":
      await ack(flags);
      break;
    case "stop":
      await stop();
      break;
    case "sessions":
      await sessions();
      break;
    default:
      usage();
      // Do NOT start a service unless explicitly told to.
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
