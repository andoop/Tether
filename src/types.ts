export type MessageSource = "mobile" | "agent" | "server";
export type MessageKind = "chat" | "question" | "answer" | "status" | "notice";

export interface Message {
  id: string;
  source: MessageSource;
  kind: MessageKind;
  text: string;
  sessionId: string;
  createdAt: string;
}

export interface RuntimeSession {
  id: string;
  title: string;
  /** Optional Sandtable-style label. Sessions are repo-level by default; feature is never required. */
  feature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PairResult {
  token: string;
  sessions: RuntimeSession[];
}
