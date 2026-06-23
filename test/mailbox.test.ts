import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolvePaths, type RuntimePaths } from "../src/paths.js";
import { createMessage, enqueueInbox, readInbox, markProcessed, messagesAfter } from "../src/mailbox.js";

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

describe("messagesAfter (waiter cursor selector)", () => {
  const mk = (id: string) => createMessage({ source: "mobile", kind: "chat", text: id, sessionId: "s1" });

  it("returns all messages when no cursor is given", () => {
    const a = mk("a");
    const b = mk("b");
    expect(messagesAfter([a, b]).length).toBe(2);
    expect(messagesAfter([a, b], "").length).toBe(2);
  });

  it("returns only messages whose id sorts strictly after the cursor", () => {
    const msgs = [
      { ...mk("x"), id: "001" },
      { ...mk("y"), id: "002" },
      { ...mk("z"), id: "003" }
    ];
    const out = messagesAfter(msgs, "001");
    expect(out.map((m) => m.id)).toEqual(["002", "003"]);
  });

  it("returns empty when cursor is at or past the newest id", () => {
    const msgs = [
      { ...mk("x"), id: "001" },
      { ...mk("y"), id: "002" }
    ];
    expect(messagesAfter(msgs, "002")).toEqual([]);
    expect(messagesAfter(msgs, "999")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const msgs = [{ ...mk("x"), id: "001" }];
    const out = messagesAfter(msgs);
    expect(out).not.toBe(msgs);
    expect(out.length).toBe(1);
  });
});
