import { getDb } from "./db";
import { DAY_MS, simNow } from "./clock";
import { messageText } from "./messages";
import type { Memory, MemoryView, MomentCategory, Tier } from "./types";

/** The LLM picks the category; code owns the lifespan. Keeps the demo deterministic. */
export const CATEGORIES: Record<MomentCategory, { ttlDays: number; needsCheckin: boolean }> = {
  injury: { ttlDays: 7, needsCheckin: true },
  illness: { ttlDays: 7, needsCheckin: true },
  travel: { ttlDays: 5, needsCheckin: false },
  stress: { ttlDays: 5, needsCheckin: false },
  poor_sleep: { ttlDays: 2, needsCheckin: false },
  fatigue: { ttlDays: 2, needsCheckin: false },
  other: { ttlDays: 3, needsCheckin: false },
};

const FADING_AT = 0.3;
const MAX_TTL_DAYS = 21;
const CHECKIN_GRACE_DAYS = 3;

export function strength(m: Memory, now = simNow()): number {
  if (m.tier !== "moment" || !m.expires_at || !m.ttl_days) return 1;
  const left = (new Date(m.expires_at).getTime() - now.getTime()) / DAY_MS;
  return Math.max(0, Math.min(1, left / m.ttl_days));
}

export function toView(m: Memory, now = simNow()): MemoryView {
  const isMoment = m.tier === "moment" && !!m.expires_at;
  const daysLeft = isMoment
    ? Math.max(0, Math.ceil((new Date(m.expires_at!).getTime() - now.getTime()) / DAY_MS))
    : null;
  return {
    ...m,
    strength: strength(m, now),
    days_left: daysLeft,
    source_text: m.source_message_id ? messageText(m.source_message_id) : null,
  };
}

export function getMemory(id: number): Memory | undefined {
  return getDb().prepare("SELECT * FROM memories WHERE id = ?").get(id) as Memory | undefined;
}

/** Memories the coach and board care about: not resolved, not faded. */
export function liveMemories(): Memory[] {
  return getDb()
    .prepare("SELECT * FROM memories WHERE status IN ('active','fading','checkin') ORDER BY id")
    .all() as Memory[];
}

export function resolvedMemories(): Memory[] {
  return getDb()
    .prepare("SELECT * FROM memories WHERE status = 'resolved' ORDER BY id DESC")
    .all() as Memory[];
}

export function createMemory(input: {
  tier: Tier;
  category?: MomentCategory | null;
  text: string;
  endDate?: string | null;
  sourceMessageId?: number | null;
}): Memory {
  const now = simNow();
  const nowIso = now.toISOString();
  let ttl: number | null = null;
  let expires: string | null = null;
  let needsCheckin = 0;
  let category: MomentCategory | null = null;

  if (input.tier === "moment") {
    category = input.category && input.category in CATEGORIES ? input.category : "other";
    const rule = CATEGORIES[category];
    needsCheckin = rule.needsCheckin ? 1 : 0;
    if (input.endDate) {
      // End of the stated day, local time.
      const [y, m, d] = input.endDate.split("-").map(Number);
      const end = new Date(y, m - 1, d, 23, 59);
      ttl = Math.max(0.5, (end.getTime() - now.getTime()) / DAY_MS);
      expires = end.toISOString();
    } else {
      ttl = rule.ttlDays;
      expires = new Date(now.getTime() + ttl * DAY_MS).toISOString();
    }
  }

  const info = getDb()
    .prepare(
      `INSERT INTO memories (tier, category, text, status, created_at, refreshed_at, ttl_days, expires_at, end_date, needs_checkin, source_message_id)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.tier, category, input.text, nowIso, nowIso, ttl, expires, input.endDate ?? null, needsCheckin, input.sourceMessageId ?? null);
  return getMemory(Number(info.lastInsertRowid))!;
}

/** A mention refills the ring and extends the lifespan. */
export function refreshMemory(id: number): Memory | undefined {
  const m = getMemory(id);
  if (!m) return undefined;
  const now = simNow();
  if (m.tier === "moment" && m.ttl_days) {
    const ttl = m.end_date ? m.ttl_days : Math.min(m.ttl_days * 1.5, MAX_TTL_DAYS);
    const expires = m.end_date ? m.expires_at : new Date(now.getTime() + ttl * DAY_MS).toISOString();
    getDb()
      .prepare(
        "UPDATE memories SET status='active', refreshed_at=?, ttl_days=?, expires_at=?, checkin_sent_at=NULL WHERE id=?",
      )
      .run(now.toISOString(), ttl, expires, id);
  } else {
    getDb().prepare("UPDATE memories SET status='active', refreshed_at=? WHERE id=?").run(now.toISOString(), id);
  }
  return getMemory(id);
}

export function resolveMemory(id: number): Memory | undefined {
  getDb().prepare("UPDATE memories SET status='resolved', refreshed_at=? WHERE id=?").run(simNow().toISOString(), id);
  return getMemory(id);
}

export function updateMemoryText(id: number, text: string): Memory | undefined {
  getDb().prepare("UPDATE memories SET text=? WHERE id=?").run(text, id);
  return getMemory(id);
}

/**
 * Recompute statuses for the current sim time.
 * Returns memories that just entered 'checkin' (caller sends one check-in message for them).
 */
export function tick(now = simNow()): Memory[] {
  const db = getDb();
  const newlyCheckin: Memory[] = [];
  const setStatus = db.prepare("UPDATE memories SET status=? WHERE id=?");

  for (const m of liveMemories()) {
    if (m.tier !== "moment") continue;
    const s = strength(m, now);

    if (m.needs_checkin) {
      if (m.status === "checkin") {
        const sent = m.checkin_sent_at ? new Date(m.checkin_sent_at).getTime() : now.getTime();
        if (now.getTime() - sent > CHECKIN_GRACE_DAYS * DAY_MS) setStatus.run("faded", m.id);
      } else if (s <= FADING_AT) {
        db.prepare("UPDATE memories SET status='checkin', checkin_sent_at=? WHERE id=?").run(now.toISOString(), m.id);
        newlyCheckin.push(getMemory(m.id)!);
      } else if (m.status !== "active") {
        setStatus.run("active", m.id);
      }
      continue;
    }

    const next = s <= 0 ? "faded" : s <= FADING_AT ? "fading" : "active";
    if (next !== m.status) setStatus.run(next, m.id);
  }
  return newlyCheckin;
}

export function pendingCheckins(): Memory[] {
  return getDb().prepare("SELECT * FROM memories WHERE status='checkin' ORDER BY id").all() as Memory[];
}
