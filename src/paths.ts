import path from "node:path";

export interface RuntimePaths {
  repoRoot: string;
  runtimeRoot: string;
  inbox: string;
  processed: string;
  sessionsFile: string;
  conversations: string;
  devicesFile: string;
}

export function resolvePaths(repoRoot: string): RuntimePaths {
  const runtimeRoot = path.join(repoRoot, "mobile-bridge", ".runtime");
  return {
    repoRoot,
    runtimeRoot,
    inbox: path.join(runtimeRoot, "mailbox", "inbox"),
    processed: path.join(runtimeRoot, "mailbox", "processed"),
    sessionsFile: path.join(runtimeRoot, "sessions.json"),
    conversations: path.join(runtimeRoot, "conversations"),
    devicesFile: path.join(runtimeRoot, "devices.json")
  };
}
