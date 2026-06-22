import Fastify, { type FastifyInstance } from "fastify";
import type { RuntimePaths } from "./paths.js";
import { PairingRegistry } from "./pairing.js";
import { DeviceStore } from "./devices.js";
import { registerRoutes } from "./http.js";

export interface ServerContext {
  paths: RuntimePaths;
  pairing: PairingRegistry;
  devices: DeviceStore;
}

export interface CreateServerOptions {
  pairing?: PairingRegistry;
  devices?: DeviceStore;
}

/**
 * Build (but do not listen) a configured Fastify app. Tests call createServer(paths)
 * and use app.inject(...). The CLI passes in a shared pairing registry / device store
 * so it can mint the in-process PIN and QR token.
 */
export async function createServer(
  paths: RuntimePaths,
  opts: CreateServerOptions = {}
): Promise<FastifyInstance> {
  const pairing = opts.pairing ?? new PairingRegistry();
  const devices = opts.devices ?? (await new DeviceStore(paths.devicesFile).load());
  const app = Fastify({ logger: false });
  const ctx: ServerContext = { paths, pairing, devices };
  await registerRoutes(app, ctx);
  return app;
}
