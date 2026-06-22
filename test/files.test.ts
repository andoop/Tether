import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  resolveSafe,
  isSecret,
  isExcluded,
  listDir,
  readContent,
  normalizeRel
} from "../src/files.js";
import { HttpError } from "../src/errors.js";

function gitInit(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.test"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "tester"], { cwd: dir });
}

describe("resolveSafe (TC6)", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "mb-resolve-"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("rejects ../ traversal", () => {
    expect(() => resolveSafe(root, "../etc/passwd")).toThrow(HttpError);
  });

  it("rejects deep ../ traversal", () => {
    expect(() => resolveSafe(root, "../../etc/passwd")).toThrow(HttpError);
  });

  it("rejects absolute paths", () => {
    let err: unknown;
    try {
      resolveSafe(root, "/etc/passwd");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
  });

  it("rejects NUL bytes", () => {
    let err: unknown;
    try {
      resolveSafe(root, "foo\0bar");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });

  it("allows a normal in-repo relative path", () => {
    const abs = resolveSafe(root, "src/app.ts");
    expect(abs.startsWith(path.resolve(root))).toBe(true);
  });
});

describe("isSecret (TC7)", () => {
  it("flags secret/credential files", () => {
    expect(isSecret(".env")).toBe(true);
    expect(isSecret("config/.env.local")).toBe(true);
    expect(isSecret("id_rsa")).toBe(true);
    expect(isSecret(".ssh/id_ed25519")).toBe(true);
    expect(isSecret("credentials.json")).toBe(true);
    expect(isSecret(".npmrc")).toBe(true);
    expect(isSecret("server.key")).toBe(true);
    expect(isSecret("cert.pem")).toBe(true);
  });

  it("does not flag ordinary files", () => {
    expect(isSecret("src/app.ts")).toBe(false);
    expect(isSecret("README.md")).toBe(false);
  });
});

describe("isExcluded (TC17)", () => {
  it("excludes .git, node_modules and mobile-bridge/.runtime", () => {
    expect(isExcluded(".git")).toBe(true);
    expect(isExcluded(".git/config")).toBe(true);
    expect(isExcluded("node_modules")).toBe(true);
    expect(isExcluded("node_modules/foo/index.js")).toBe(true);
    expect(isExcluded("mobile-bridge/.runtime")).toBe(true);
    expect(isExcluded("mobile-bridge/.runtime/devices.json")).toBe(true);
  });

  it("does not exclude ordinary files", () => {
    expect(isExcluded("src/app.ts")).toBe(false);
    expect(isExcluded("README.md")).toBe(false);
  });
});

describe("normalizeRel", () => {
  it("strips leading ./ and trailing slashes", () => {
    expect(normalizeRel("./src/")).toBe("src");
    expect(normalizeRel("")).toBe("");
    expect(normalizeRel(null)).toBe("");
  });
});

describe("listDir (TC4/TC17 traversal guard)", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "mb-listdir-"));
    gitInit(root);
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "app.ts"), "export const x = 1\n");
    writeFileSync(path.join(root, "README.md"), "# hi\n");
    // gitignored dir
    writeFileSync(path.join(root, ".gitignore"), "node_modules/\nbuild/\n");
    mkdirSync(path.join(root, "node_modules"));
    writeFileSync(path.join(root, "node_modules", "foo.js"), "x\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("lists root tracked entries, excludes node_modules", async () => {
    const entries = await listDir(root, "");
    const names = entries.map((e) => e.path);
    expect(names).toContain("src");
    expect(names).toContain("README.md");
    expect(names).not.toContain("node_modules");
  });

  it("applies resolveSafe to directory reads (traversal rejected)", async () => {
    await expect(listDir(root, "../etc")).rejects.toThrow(HttpError);
  });

  it("lists files inside a subdir with type and size", async () => {
    const entries = await listDir(root, "src");
    const app = entries.find((e) => e.path === "src/app.ts");
    expect(app).toBeDefined();
    expect(app!.type).toBe("file");
    expect(app!.size).toBeGreaterThan(0);
  });
});

describe("readContent (TC5/TC7/TC15)", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "mb-read-"));
    gitInit(root);
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "app.ts"), "export const x = 1\n");
    writeFileSync(path.join(root, ".env"), "SECRET=abc\n");
    writeFileSync(path.join(root, ".gitignore"), "build/\n");
    mkdirSync(path.join(root, "build"));
    writeFileSync(path.join(root, "build", "out.txt"), "token=xyz\n");
    // only src/app.ts is tracked; .env and build are untracked
    execFileSync("git", ["add", "src/app.ts", ".gitignore"], { cwd: root });
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reads a tracked file's exact bytes (TC5)", async () => {
    const res = await readContent(root, "src/app.ts");
    expect(res.truncated).toBe(false);
    expect(res.content).toBe("export const x = 1\n");
  });

  it("returns 403 for a secret file (TC7)", async () => {
    let err: unknown;
    try {
      await readContent(root, ".env");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
  });

  it("returns 403 for a .gitignore'd non-secret file (TC15)", async () => {
    let err: unknown;
    try {
      await readContent(root, "build/out.txt");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
  });

  it("returns 400 for a directory", async () => {
    let err: unknown;
    try {
      await readContent(root, "src");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });
});
