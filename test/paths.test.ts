import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolvePaths } from "../src/paths.js";

describe("resolvePaths runtime dir", () => {
  it("runtimeRoot ends with /.tether under the repo root", () => {
    const paths = resolvePaths("/tmp/some-repo");
    expect(paths.runtimeRoot.endsWith(`${path.sep}.tether`)).toBe(true);
    expect(paths.runtimeRoot).toBe(path.join("/tmp/some-repo", ".tether"));
  });

  it("derives inbox/processed/sessions/devices under .tether", () => {
    const paths = resolvePaths("/tmp/some-repo");
    expect(paths.inbox.startsWith(paths.runtimeRoot)).toBe(true);
    expect(paths.processed.startsWith(paths.runtimeRoot)).toBe(true);
    expect(paths.sessionsFile.startsWith(paths.runtimeRoot)).toBe(true);
    expect(paths.devicesFile.startsWith(paths.runtimeRoot)).toBe(true);
    expect(paths.conversations.startsWith(paths.runtimeRoot)).toBe(true);
  });
});
