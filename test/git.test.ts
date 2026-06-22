import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gitStatus, gitDiff } from "../src/git.js";

function gitInit(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.test"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "tester"], { cwd: dir });
}

describe("gitStatus / gitDiff (TC8/TC9)", () => {
  let repo: string;
  let plain: string;

  beforeAll(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), "mb-git-"));
    gitInit(repo);
    mkdirSync(path.join(repo, "src"));
    writeFileSync(path.join(repo, "src", "app.ts"), "export const x = 1\n");
    writeFileSync(path.join(repo, "README.md"), "# hi\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repo });
    // unstaged change to src/app.ts
    writeFileSync(path.join(repo, "src", "app.ts"), "export const x = 2\n");
    // staged change to README.md
    writeFileSync(path.join(repo, "README.md"), "# hi there\n");
    execFileSync("git", ["add", "README.md"], { cwd: repo });

    plain = mkdtempSync(path.join(os.tmpdir(), "mb-plain-"));
    writeFileSync(path.join(plain, "f.txt"), "hello\n");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(plain, { recursive: true, force: true });
  });

  it("git repo with changes -> ok:true and lists the changed files", async () => {
    const res = await gitStatus(repo);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byPath = new Map(res.entries.map((e) => [e.path, e]));
    expect(byPath.has("src/app.ts")).toBe(true);
    expect(byPath.get("src/app.ts")!.unstaged).toBe(true);
    expect(byPath.has("README.md")).toBe(true);
    expect(byPath.get("README.md")!.staged).toBe(true);
  });

  it("non-git dir -> ok:false with reason", async () => {
    const res = await gitStatus(plain);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("not a git repository");
  });

  it("gitDiff returns +/- lines for the working tree", async () => {
    const res = await gitDiff(repo);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).toContain("src/app.ts");
    expect(res.text).toContain("-export const x = 1");
    expect(res.text).toContain("+export const x = 2");
    // staged diff for README.md is included
    expect(res.staged).toContain("README.md");
  });

  it("gitDiff on non-git dir -> ok:false", async () => {
    const res = await gitDiff(plain);
    expect(res.ok).toBe(false);
  });
});
