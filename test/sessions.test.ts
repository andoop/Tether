import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolvePaths, type RuntimePaths } from "../src/paths.js";
import { ensureDefaultSession, listSessions } from "../src/sessions.js";

describe("ensureDefaultSession (TC3/TC14)", () => {
  let root: string;
  let paths: RuntimePaths;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "mb-sessions-"));
    paths = resolvePaths(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("creates a repo-level default session with no feature", async () => {
    const s = await ensureDefaultSession(paths);
    expect(s.id.startsWith("sess_")).toBe(true);
    expect(s.feature).toBeUndefined();
    expect(typeof s.title).toBe("string");
  });

  it("is idempotent: does not create a second feature-less session", async () => {
    const first = await ensureDefaultSession(paths);
    const second = await ensureDefaultSession(paths);
    expect(second.id).toBe(first.id);
    const all = await listSessions(paths);
    expect(all.filter((x) => !x.feature).length).toBe(1);
  });
});
