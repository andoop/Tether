import { promises as fs } from "node:fs";
import path from "node:path";
import type { RuntimePaths } from "./paths.js";
import type { Message } from "./types.js";

function fileFor(paths: RuntimePaths, sessionId: string): string {
  return path.join(paths.conversations, `${sessionId}.json`);
}

export async function appendMessage(paths: RuntimePaths, message: Message): Promise<Message> {
  await fs.mkdir(paths.conversations, { recursive: true });
  const file = fileFor(paths, message.sessionId);
  const list = await listMessages(paths, message.sessionId);
  list.push(message);
  await fs.writeFile(file, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  return message;
}

export async function listMessages(paths: RuntimePaths, sessionId: string): Promise<Message[]> {
  try {
    const raw = await fs.readFile(fileFor(paths, sessionId), "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Message[]) : [];
  } catch {
    return [];
  }
}
