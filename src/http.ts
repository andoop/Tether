import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ServerContext } from "./server.js";
import { HttpError } from "./errors.js";
import { listDir, readContent } from "./files.js";
import { gitStatus, gitDiff } from "./git.js";
import { createMessage, enqueueInbox, readInbox, markProcessed, messagesAfter } from "./mailbox.js";
import { appendMessage, listMessages } from "./conversations.js";
import { ensureDefaultSession, listSessions, getSession, touchSession } from "./sessions.js";
import type { MessageKind } from "./types.js";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function extractToken(req: FastifyRequest): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const header = req.headers["x-device-token"];
  if (typeof header === "string" && header) return header;
  const q = (req.query as Record<string, unknown> | undefined)?.token;
  if (typeof q === "string" && q) return q;
  const b = (req.body as Record<string, unknown> | undefined)?.token;
  if (typeof b === "string" && b) return b;
  return undefined;
}

function isLoopback(req: FastifyRequest): boolean {
  return LOOPBACK.has(req.ip);
}

function sendHttpError(reply: FastifyReply, e: unknown): void {
  if (e instanceof HttpError) {
    reply.code(e.status).send({ error: e.message });
    return;
  }
  reply.code(500).send({ error: "internal error" });
}

export async function registerRoutes(app: FastifyInstance, ctx: ServerContext): Promise<void> {
  const { paths, pairing, devices } = ctx;

  /** requireToken: accept ONLY durable device tokens that have been claimed via /pair. */
  function requireToken(req: FastifyRequest, reply: FastifyReply): boolean {
    const token = extractToken(req);
    if (!token || !devices.has(token)) {
      reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    return true;
  }

  function requireLoopback(req: FastifyRequest, reply: FastifyReply): boolean {
    if (!isLoopback(req) && !(extractToken(req) && devices.has(extractToken(req)!))) {
      reply.code(403).send({ error: "loopback only" });
      return false;
    }
    return true;
  }

  // --- open ---
  app.get("/health", async () => ({ ok: true }));

  // --- pairing: the ONLY network path to obtain a token ---
  app.post("/pair", async (req, reply) => {
    const body = (req.body ?? {}) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";
    const token = pairing.claimByCode(code, req.ip);
    if (!token) {
      // never echo the code; uniform error
      return reply.code(401).send({ error: "invalid or expired pairing code" });
    }
    await devices.add(token);
    await ensureDefaultSession(paths);
    const sessions = await listSessions(paths);
    return reply.send({ token, sessions });
  });

  // --- sessions ---
  app.get("/sessions", async (req, reply) => {
    if (!requireToken(req, reply)) return;
    await ensureDefaultSession(paths);
    return reply.send({ sessions: await listSessions(paths) });
  });

  app.get<{ Params: { id: string } }>("/sessions/:id/messages", async (req, reply) => {
    if (!requireToken(req, reply)) return;
    return reply.send({ messages: await listMessages(paths, req.params.id) });
  });

  app.post<{ Params: { id: string }; Body: { text?: unknown; kind?: unknown } }>(
    "/sessions/:id/messages",
    async (req, reply) => {
      if (!requireToken(req, reply)) return;
      const sessionId = req.params.id;
      const session = await getSession(paths, sessionId);
      if (!session) return reply.code(404).send({ error: "session not found" });
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const kind = (typeof req.body?.kind === "string" ? req.body.kind : "chat") as MessageKind;
      const message = createMessage({ source: "mobile", kind, text, sessionId });
      await appendMessage(paths, message);
      await enqueueInbox(paths, message);
      await touchSession(paths, sessionId);
      return reply.send({ ok: true, message });
    }
  );

  // --- agent -> mobile (loopback/host) ---
  app.post<{ Body: { sessionId?: unknown; text?: unknown; kind?: unknown } }>(
    "/agent/messages",
    async (req, reply) => {
      if (!requireLoopback(req, reply)) return;
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
      if (!sessionId) return reply.code(400).send({ error: "sessionId required" });
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const kind = (typeof req.body?.kind === "string" ? req.body.kind : "chat") as MessageKind;
      const message = createMessage({ source: "agent", kind, text, sessionId });
      await appendMessage(paths, message);
      await touchSession(paths, sessionId);
      return reply.send({ ok: true, message });
    }
  );

  // --- mailbox (waiter; loopback/host) ---
  app.get<{ Querystring: { after?: string } }>("/mailbox/inbox", async (req, reply) => {
    if (!requireLoopback(req, reply)) return;
    const after = req.query?.after ?? "";
    const entries = await readInbox(paths);
    const messages = messagesAfter(entries.map((e) => e.message), after);
    return reply.send({ messages });
  });

  app.post<{ Body: { ids?: unknown } }>("/mailbox/inbox/ack", async (req, reply) => {
    if (!requireLoopback(req, reply)) return;
    const ids = Array.isArray(req.body?.ids) ? (req.body!.ids as unknown[]).filter((i) => typeof i === "string") : [];
    const acked: string[] = [];
    for (const id of ids as string[]) {
      try {
        await markProcessed(paths, `${paths.inbox}/${id}.json`);
        acked.push(id);
      } catch {
        // already processed / missing
      }
    }
    return reply.send({ ok: true, acked });
  });

  // --- files (read-only) ---
  app.get<{ Querystring: { path?: string } }>("/files", async (req, reply) => {
    if (!requireToken(req, reply)) return;
    try {
      const entries = await listDir(paths.repoRoot, req.query?.path);
      return reply.send({ path: req.query?.path ?? "", entries });
    } catch (e) {
      return sendHttpError(reply, e);
    }
  });

  app.get<{ Querystring: { path?: string } }>("/files/content", async (req, reply) => {
    if (!requireToken(req, reply)) return;
    try {
      const result = await readContent(paths.repoRoot, req.query?.path);
      return reply.send(result);
    } catch (e) {
      return sendHttpError(reply, e);
    }
  });

  // read-only: reject all write methods on file endpoints
  for (const url of ["/files", "/files/content"]) {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
      app.route({
        method,
        url,
        handler: async (_req, reply) => reply.code(405).send({ error: "read-only: writes not allowed" })
      });
    }
  }

  // --- git (read-only) ---
  app.get("/git/status", async (req, reply) => {
    if (!requireToken(req, reply)) return;
    return reply.send(await gitStatus(paths.repoRoot));
  });

  app.get("/git/diff", async (req, reply) => {
    if (!requireToken(req, reply)) return;
    return reply.send(await gitDiff(paths.repoRoot));
  });

  // --- SSE push (best-effort) ---
  app.get("/stream", async (req, reply) => {
    if (!requireToken(req, reply)) return;
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    reply.raw.write(`event: ready\ndata: {}\n\n`);
    // best-effort heartbeat; connection closed by client
    const timer = setInterval(() => {
      try {
        reply.raw.write(`event: ping\ndata: {}\n\n`);
      } catch {
        clearInterval(timer);
      }
    }, 25_000);
    req.raw.on("close", () => clearInterval(timer));
  });

  // --- stop + token revocation (loopback/host) ---
  app.post("/stop", async (req, reply) => {
    if (!requireLoopback(req, reply)) return;
    await devices.revokeAll();
    pairing.clear();
    reply.send({ ok: true });
    setTimeout(() => {
      app.close().catch(() => undefined);
    }, 10);
  });
}
