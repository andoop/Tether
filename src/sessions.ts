import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { RuntimePaths } from "./paths.js";
import type { RuntimeSession } from "./types.js";

async function loadAll(paths: RuntimePaths): Promise<RuntimeSession[]> {
  try {
    const raw = await fs.readFile(paths.sessionsFile, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as RuntimeSession[]) : [];
  } catch {
    return [];
  }
}

async function saveAll(paths: RuntimePaths, list: RuntimeSession[]): Promise<void> {
  await fs.mkdir(path.dirname(paths.sessionsFile), { recursive: true });
  await fs.writeFile(paths.sessionsFile, `${JSON.stringify(list, null, 2)}\n`, "utf8");
}

export async function listSessions(paths: RuntimePaths): Promise<RuntimeSession[]> {
  return loadAll(paths);
}

export async function getSession(paths: RuntimePaths, id: string): Promise<RuntimeSession | null> {
  return (await loadAll(paths)).find((s) => s.id === id) ?? null;
}

export async function upsertSession(paths: RuntimePaths, session: RuntimeSession): Promise<RuntimeSession> {
  const list = await loadAll(paths);
  const i = list.findIndex((s) => s.id === session.id);
  if (i >= 0) list[i] = session;
  else list.push(session);
  await saveAll(paths, list);
  return session;
}

export async function touchSession(paths: RuntimePaths, id: string): Promise<RuntimeSession | null> {
  const list = await loadAll(paths);
  const s = list.find((x) => x.id === id);
  if (!s) return null;
  s.updatedAt = new Date().toISOString();
  await saveAll(paths, list);
  return s;
}

/** Ensure at least one repo-level session exists (NO feature required). */
export async function ensureDefaultSession(paths: RuntimePaths): Promise<RuntimeSession> {
  const list = await loadAll(paths);
  const existing = list.find((s) => !s.feature);
  if (existing) return existing;
  const now = new Date().toISOString();
  const session: RuntimeSession = {
    id: `sess_${nanoid(10)}`,
    title: path.basename(paths.repoRoot) || "repo",
    createdAt: now,
    updatedAt: now
  };
  list.push(session);
  await saveAll(paths, list);
  return session;
}
