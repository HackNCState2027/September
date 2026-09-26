import { currentSession, getDb, getStateValue, setStateValue } from "./db";
import { simOffsetDays } from "./clock";

/**
 * Rewinding undoes the last fast-forward exactly. Moving the clock back alone would not
 * bring faded memories back or remove the coach's check-in, so each fast-forward saves a
 * snapshot of memory, conversation and clock that rewind restores.
 */
interface Snapshot {
  offset: number;
  sessionId: number;
  maxMessageId: number;
  memories: Record<string, unknown>[];
}

const KEY = "clock_snapshots";

function stack(): Snapshot[] {
  const raw = getStateValue(KEY);
  return raw ? (JSON.parse(raw) as Snapshot[]) : [];
}

export function canRewind(): boolean {
  return stack().length > 0;
}

export function saveSnapshot() {
  const db = getDb();
  const snap: Snapshot = {
    offset: simOffsetDays(),
    sessionId: currentSession(db),
    maxMessageId: (db.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM messages").get() as { n: number }).n,
    memories: db.prepare("SELECT * FROM memories").all() as Record<string, unknown>[],
  };
  setStateValue(db, KEY, JSON.stringify([...stack(), snap]));
}

/** Restores the most recent snapshot. Returns false when there is nothing to rewind. */
export function rewind(): boolean {
  const snaps = stack();
  const snap = snaps.pop();
  if (!snap) return false;
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM messages WHERE id > ?").run(snap.maxMessageId);
    db.prepare("DELETE FROM memories").run();
    if (snap.memories.length) {
      const cols = Object.keys(snap.memories[0]);
      const insert = db.prepare(
        `INSERT INTO memories (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`,
      );
      for (const m of snap.memories) insert.run(m);
    }
    setStateValue(db, "sim_offset_days", String(snap.offset));
    setStateValue(db, "session_id", String(snap.sessionId));
    setStateValue(db, KEY, JSON.stringify(snaps));
  })();
  return true;
}

export function clearSnapshots() {
  setStateValue(getDb(), KEY, "[]");
}
