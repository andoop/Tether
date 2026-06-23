import { execFile } from "node:child_process";
import { promises as fs, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { HttpError } from "./errors.js";

const pexec = promisify(execFile);
const GIT_OPTS = { maxBuffer: 64 * 1024 * 1024 } as const;
const MAX_CONTENT_BYTES = 1024 * 1024;

/**
 * Expanded secret/credential matcher. Any rel path matching these is masked in
 * listings and rejected (403) on content read.
 */
const SECRET_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/i,
  /credentials/i,
  /secret/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.p8$/i,
  /\.(jks|keystore)$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.git-credentials$/i,
  /(^|\/)\.netrc$/i,
  /\.tfstate$/i,
  /serviceaccount/i,
  /\.(crt|cer)$/i,
  /\.token$/i
];

export function isSecret(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  return SECRET_PATTERNS.some((re) => re.test(norm));
}

/** Always-excluded paths in EVERY mode (git or non-git). */
export function isExcluded(rel: string): boolean {
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.includes(".git") || parts.includes("node_modules") || parts.includes(".tether");
}

export function normalizeRel(rel: string | undefined | null): string {
  if (!rel) return "";
  let r = rel.replace(/\\/g, "/");
  r = r.replace(/^\.?\/+/, "");
  r = r.replace(/\/+$/, "");
  return r;
}

/**
 * Resolve rel against repoRoot, rejecting absolute paths, NUL, `..` escapes and
 * symlink escapes. Does not require repoRoot to exist on disk (string check), but
 * applies a realpath check whenever the target actually exists.
 */
export function resolveSafe(repoRoot: string, rel: string): string {
  if (rel.includes("\0")) throw new HttpError(400, "invalid path");
  if (path.isAbsolute(rel)) throw new HttpError(403, "absolute path not allowed");
  const root = path.resolve(repoRoot);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new HttpError(403, "path escapes repo root");
  }
  try {
    const rootReal = realpathSync(root);
    const absReal = realpathSync(abs);
    if (absReal !== rootReal && !absReal.startsWith(rootReal + path.sep)) {
      throw new HttpError(403, "path escapes repo root");
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // target (or root) not present on disk: rely on the string-level check above
  }
  return abs;
}

async function isGitRepo(repoRoot: string): Promise<boolean> {
  try {
    const { stdout } = await pexec("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repoRoot,
      ...GIT_OPTS
    });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function gitList(repoRoot: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await pexec("git", args, { cwd: repoRoot, ...GIT_OPTS });
    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function walkDir(repoRoot: string, rel: string, out: Set<string>): Promise<void> {
  const abs = path.join(repoRoot, rel);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (isExcluded(childRel)) continue;
    if (e.isDirectory()) {
      await walkDir(repoRoot, childRel, out);
    } else if (e.isFile()) {
      out.add(childRel);
    }
  }
}

/** Relative file paths the mobile client is allowed to see: git-tracked ∪ allowed-untracked (or, in non-git mode, the walked tree). EXCLUDE always applied. */
export async function allowedSet(repoRoot: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (await isGitRepo(repoRoot)) {
    const tracked = await gitList(repoRoot, ["ls-files"]);
    const untracked = await gitList(repoRoot, ["ls-files", "--others", "--exclude-standard"]);
    for (const f of [...tracked, ...untracked]) {
      if (f && !isExcluded(f)) out.add(f);
    }
  } else {
    await walkDir(repoRoot, "", out);
  }
  return out;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  masked?: boolean;
}

export async function listDir(repoRoot: string, rel: string | undefined | null): Promise<DirEntry[]> {
  const cleanRel = normalizeRel(rel);
  // path-traversal guard applies to directory reads too
  resolveSafe(repoRoot, cleanRel || ".");
  if (cleanRel && isExcluded(cleanRel)) return [];

  const set = await allowedSet(repoRoot);
  const prefix = cleanRel ? `${cleanRel}/` : "";
  const dirs = new Set<string>();
  const files: string[] = [];
  for (const f of set) {
    if (prefix && !f.startsWith(prefix)) continue;
    const rest = f.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash === -1) files.push(f);
    else dirs.add(rest.slice(0, slash));
  }

  const entries: DirEntry[] = [];
  for (const d of [...dirs].sort()) {
    entries.push({ name: d, path: `${prefix}${d}`, type: "dir" });
  }
  for (const f of files.sort()) {
    let size: number | undefined;
    try {
      size = statSync(path.join(repoRoot, f)).size;
    } catch {
      size = undefined;
    }
    entries.push({ name: f.slice(prefix.length), path: f, type: "file", size, masked: isSecret(f) });
  }
  return entries;
}

export interface FileContent {
  path: string;
  truncated: boolean;
  content?: string;
  size: number;
  binary?: boolean;
}

export async function readContent(repoRoot: string, rel: string | undefined | null): Promise<FileContent> {
  if (rel && rel.includes("\0")) throw new HttpError(400, "invalid path");
  const cleanRel = normalizeRel(rel);
  if (!cleanRel) throw new HttpError(400, "path required");

  const abs = resolveSafe(repoRoot, cleanRel);

  let st: import("node:fs").Stats;
  try {
    st = statSync(abs);
  } catch {
    throw new HttpError(404, "not found");
  }
  if (st.isDirectory()) throw new HttpError(400, "path is a directory");
  if (isExcluded(cleanRel)) throw new HttpError(403, "path is excluded");
  if (isSecret(cleanRel)) throw new HttpError(403, "secret file is masked");

  const set = await allowedSet(repoRoot);
  if (!set.has(cleanRel)) throw new HttpError(403, "file not in allowed set");

  const buf = await fs.readFile(abs);
  const binary = buf.includes(0);
  if (st.size > MAX_CONTENT_BYTES || binary) {
    return { path: cleanRel, truncated: true, size: st.size, binary };
  }
  return { path: cleanRel, truncated: false, size: st.size, content: buf.toString("utf8") };
}
