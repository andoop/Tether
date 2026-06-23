import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { resolvePaths, type RuntimePaths } from "../src/paths.js";
import { createServer } from "../src/server.js";
import { PairingRegistry } from "../src/pairing.js";
import { DeviceStore } from "../src/devices.js";
import { readInbox } from "../src/mailbox.js";

describe("HTTP routes (TC16/TC14/TC3)", () => {
  let root: string;
  let paths: RuntimePaths;
  let app: FastifyInstance;
  let pairing: PairingRegistry;
  let devices: DeviceStore;

  beforeEach(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), "mb-http-"));
    paths = resolvePaths(root);
    pairing = new PairingRegistry();
    devices = await new DeviceStore(paths.devicesFile).load();
    app = await createServer(paths, { pairing, devices });
  });

  afterEach(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("GET /health -> 200 { ok: true }", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("serves the bundled web client at / and /app.js", async () => {
    const index = await app.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.headers["content-type"]).toContain("text/html");
    expect(index.body).toContain("Tether");
    const js = await app.inject({ method: "GET", url: "/app.js" });
    expect(js.statusCode).toBe(200);
  });

  it("GET /sessions without token -> 401 (TC16)", async () => {
    const res = await app.inject({ method: "GET", url: "/sessions" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /files with a forged token -> 401 (TC16)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/files",
      headers: { authorization: "Bearer dev_forged_token" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /pair with wrong code -> 401 and never returns a code field (TC16)", async () => {
    pairing.createPin();
    const res = await app.inject({ method: "POST", url: "/pair", payload: { code: "000000" } });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body).not.toHaveProperty("code");
    expect(body).not.toHaveProperty("token");
  });

  it("file write methods are rejected (read-only)", async () => {
    const res = await app.inject({ method: "POST", url: "/files", payload: {} });
    expect(res.statusCode).toBe(405);
  });

  it("full chat path: pair -> sessions -> post message -> inbox (TC3/TC14)", async () => {
    const { code } = pairing.createPin();

    const pairRes = await app.inject({ method: "POST", url: "/pair", payload: { code } });
    expect(pairRes.statusCode).toBe(200);
    const { token, sessions } = pairRes.json() as {
      token: string;
      sessions: Array<{ id: string; feature?: string }>;
    };
    expect(token.startsWith("dev_")).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0].feature).toBeUndefined();

    const auth = { authorization: `Bearer ${token}` };

    // sessions now reachable with the durable token
    const sessRes = await app.inject({ method: "GET", url: "/sessions", headers: auth });
    expect(sessRes.statusCode).toBe(200);
    const sessionId = (sessRes.json() as { sessions: Array<{ id: string }> }).sessions[0].id;

    // post a chat message
    const postRes = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/messages`,
      headers: auth,
      payload: { text: "hello", kind: "chat" }
    });
    expect(postRes.statusCode).toBe(200);
    expect((postRes.json() as { ok: boolean }).ok).toBe(true);

    // it landed in the mailbox inbox as source=mobile
    const inbox = await readInbox(paths);
    expect(inbox.length).toBe(1);
    expect(inbox[0].message.text).toBe("hello");
    expect(inbox[0].message.source).toBe("mobile");

    // and is visible in the conversation log
    const msgsRes = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages`,
      headers: auth
    });
    expect(msgsRes.statusCode).toBe(200);
    const msgs = (msgsRes.json() as { messages: Array<{ text: string }> }).messages;
    expect(msgs.some((m) => m.text === "hello")).toBe(true);
  });
});
