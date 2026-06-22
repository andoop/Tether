#!/usr/bin/env node
import os from "node:os";
import { nanoid } from "nanoid";
import { resolvePaths } from "./paths.js";
import { PairingRegistry } from "./pairing.js";
import { DeviceStore } from "./devices.js";
import { createServer } from "./server.js";
import { buildPairPayload, renderQr } from "./qr.js";

const DEFAULT_PORT = 8770;
const MAX_PORT_SCAN = 50;

function lanAddress(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
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

  // PIN + QR durable token are minted IN-PROCESS and only printed to the terminal.
  const { code } = pairing.createPin();
  const qrToken = `dev_${nanoid(40)}`;
  await devices.add(qrToken);
  const payload = buildPairPayload(url, qrToken);
  const qr = await renderQr(payload);

  process.stdout.write("\nmobile-bridge is running.\n");
  process.stdout.write(`  URL:          ${url}\n`);
  process.stdout.write(`  Pairing code: ${code}  (enter on your phone; expires in 10 min)\n`);
  process.stdout.write("  Scan to pair:\n");
  process.stdout.write(`${qr}\n`);
  process.stdout.write(
    "  SECURITY: this binds to 0.0.0.0 (LAN). Only run on trusted networks.\n" +
      "            Anyone with the QR token or pairing code can browse files (read-only) and git diff.\n\n"
  );

  const shutdown = () => {
    app.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function usage(): void {
  process.stdout.write(
    "mobile-bridge — phone remote companion (chat + read-only file browse + git diff)\n\n" +
      "Usage:\n  mobile-bridge start    Start the service and print pairing code + URL + QR\n"
  );
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "start") {
    await start();
  } else {
    usage();
    // Do NOT start a service unless explicitly told to.
    process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
