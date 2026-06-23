import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { RuntimePaths } from "./paths.js";
import type { Message, MessageKind, MessageSource } from "./types.js";

export function createMessage(input: {
  source: MessageSource;
  kind: MessageKind;
  text: string;
  sessionId: string;
}): Message {
  const createdAt = new Date().toISOString();
  const compact = createdAt.replace(/[-:.TZ]/g, "");
  return {
    id: `${compact}-${input.source}-${nanoid(8)}`,
    source: input.source,
    kind: input.kind,
    text: input.text,
    sessionId: input.sessionId,
    createdAt
  };
}

export async function enqueueInbox(paths: RuntimePaths, message: Message): Promise<Message> {
  await fs.mkdir(paths.inbox, { recursive: true });
  const target = path.join(paths.inbox, `${message.id}.json`);
  await fs.writeFile(target, `${JSON.stringify(message, null, 2)}\n`, "utf8");
  return message;
}

export async function readInbox(paths: RuntimePaths): Promise<Array<{ message: Message; file: string }>> {
  let names: string[];
  try {
    names = await fs.readdir(paths.inbox);
  } catch {
    return [];
  }
  const out: Array<{ message: Message; file: string }> = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    const full = path.join(paths.inbox, name);
    try {
      const raw = await fs.readFile(full, "utf8");
      out.push({ message: JSON.parse(raw) as Message, file: full });
    } catch {
      // skip unreadable/partial entries
    }
  }
  return out;
}

export async function markProcessed(paths: RuntimePaths, file: string): Promise<void> {
  await fs.mkdir(paths.processed, { recursive: true });
  const base = path.basename(file);
  await fs.rename(file, path.join(paths.processed, base));
}

/**
 * Pure selector: given a list of messages and an optional cursor id, return only
 * messages whose id sorts strictly after the cursor. Mirrors the GET
 * /mailbox/inbox?after=<id> filtering so the waiter loop can be unit-tested
 * without real polling. Message ids are lexicographically ordered (timestamp
 * prefix), so string comparison is a stable cursor.
 */
export function messagesAfter(messages: Message[], after?: string): Message[] {
  return after ? messages.filter((m) => m.id > after) : messages.slice();
}
