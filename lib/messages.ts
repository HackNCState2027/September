import { currentSession, getDb } from "./db";
import { simNow } from "./clock";
import type { Chip, Message, ToolCallRecord } from "./types";

type Row = {
  id: number;
  role: "user" | "coach";
  kind: "chat" | "checkin" | "persona";
  text: string;
  chips_json: string | null;
  tool_calls_json: string | null;
  created_at: string;
};

function fromRow(r: Row): Message {
  return {
    id: r.id,
    role: r.role,
    kind: r.kind,
    text: r.text,
    chips: r.chips_json ? JSON.parse(r.chips_json) : [],
    tool_calls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : [],
    created_at: r.created_at,
  };
}

export function saveMessage(input: {
  role: "user" | "coach";
  kind?: "chat" | "checkin" | "persona";
  text: string;
  chips?: Chip[];
  toolCalls?: ToolCallRecord[];
}): Message {
  const info = getDb()
    .prepare(
      "INSERT INTO messages (role, kind, text, chips_json, tool_calls_json, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.role,
      input.kind ?? "chat",
      input.text,
      JSON.stringify(input.chips ?? []),
      JSON.stringify(input.toolCalls ?? []),
      simNow().toISOString(),
      currentSession(),
    );
  return getMessage(Number(info.lastInsertRowid))!;
}

export function getMessage(id: number): Message | undefined {
  const r = getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id) as Row | undefined;
  return r ? fromRow(r) : undefined;
}

/** Messages in the current conversation only. */
export function allMessages(): Message[] {
  return (
    getDb().prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id").all(currentSession()) as Row[]
  ).map(fromRow);
}

/** The last n messages of the current conversation (what the coach sees as chat history). */
export function recentMessages(n: number): Message[] {
  return (
    getDb()
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?")
      .all(currentSession(), n) as Row[]
  )
    .map(fromRow)
    .reverse();
}

/** Text of any message, from any conversation (for "learned from" on memory cards). */
export function messageText(id: number): string | null {
  const r = getDb().prepare("SELECT text FROM messages WHERE id = ?").get(id) as { text: string } | undefined;
  return r?.text ?? null;
}
