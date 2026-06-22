import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolvePaths, type RuntimePaths } from "../src/paths.js";
import { createMessage, enqueueInbox, readInbox, markProcessed } from "../src/mailbox.js";

describe("mailbox transport (TC3)", () => {
  let root: string;
  let paths: RuntimePaths;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "mb-mailbox-"));
    paths = resolvePaths(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("enqueue -> readInbox len 1 -> markProcessed -> len 0", async () => {
    const msg = createMessage({ source: "mobile", kind: "chat", text: "hello", sessionId: "s1" });
    await enqueueInbox(paths, msg);

    let entries = await readInbox(paths);
    expect(entries.length).toBe(1);
    expect(entries[0].message.text).toBe("hello");
    expect(entries[0].message.source).toBe("mobile");

    await markProcessed(paths, entries[0].file);

    entries = await readInbox(paths);
    expect(entries.length).toBe(0);
  });
});
