import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const GIT_OPTS = { maxBuffer: 64 * 1024 * 1024 } as const;

export interface GitStatusEntry {
  x: string;
  y: string;
  path: string;
  staged: boolean;
  unstaged: boolean;
}

export type GitStatusResult =
  | { ok: true; entries: GitStatusEntry[] }
  | { ok: false; reason: string };

export type GitDiffResult =
  | { ok: true; staged: string; unstaged: string; text: string }
  | { ok: false; reason: string };

async function isInsideWorkTree(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await pexec("git", ["rev-parse", "--is-inside-work-tree"], { cwd, ...GIT_OPTS });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

function parsePorcelain(out: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  for (const line of out.split("\n")) {
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    let p = line.slice(3);
    if (p.includes(" -> ")) p = p.split(" -> ")[1];
    entries.push({
      x,
      y,
      path: p,
      staged: x !== " " && x !== "?",
      unstaged: y !== " "
    });
  }
  return entries;
}

export async function gitStatus(cwd: string): Promise<GitStatusResult> {
  if (!(await isInsideWorkTree(cwd))) return { ok: false, reason: "not a git repository" };
  try {
    const { stdout } = await pexec("git", ["status", "--porcelain=v1"], { cwd, ...GIT_OPTS });
    return { ok: true, entries: parsePorcelain(stdout) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function gitDiff(cwd: string): Promise<GitDiffResult> {
  if (!(await isInsideWorkTree(cwd))) return { ok: false, reason: "not a git repository" };
  try {
    const unstaged = (await pexec("git", ["diff"], { cwd, ...GIT_OPTS })).stdout;
    const staged = (await pexec("git", ["diff", "--cached"], { cwd, ...GIT_OPTS })).stdout;
    return { ok: true, staged, unstaged, text: unstaged + staged };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
