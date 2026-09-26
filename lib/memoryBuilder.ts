import { generateJson } from "./gemini";
import { localDate, simNow } from "./clock";
import {
  createMemory,
  liveMemories,
  refreshMemory,
  resolveMemory,
  toView,
  updateMemoryText,
} from "./memoryEngine";
import type { Memory, MemoryView, MomentCategory, Tier } from "./types";

type Action =
  | { op: "create"; tier: Tier; category?: MomentCategory; text: string; end_date?: string }
  | { op: "refresh"; memory_id: number }
  | { op: "resolve"; memory_id: number }
  | { op: "update"; memory_id: number; text: string };

const SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["create", "refresh", "resolve", "update"] },
          tier: { type: "string", enum: ["core", "goal", "moment"] },
          category: {
            type: "string",
            enum: ["injury", "illness", "travel", "stress", "poor_sleep", "fatigue", "other"],
          },
          text: { type: "string", description: "Short card label, max 8 words" },
          end_date: { type: "string", description: "YYYY-MM-DD, only if the user states when it ends" },
          memory_id: { type: "integer" },
        },
        required: ["op"],
      },
    },
  },
  required: ["actions"],
};

const SYSTEM = `You maintain the long-term memory of a fitness coaching app. Read the user's newest message and return memory actions as JSON.

TIERS
- core: stable facts that must never be forgotten or violated: allergies, chronic conditions, medications, dietary rules (vegetarian, halal...), permanent injuries or past surgeries.
- goal: something the user is working toward, with or without a date (races, weight targets, habits).
- moment: a temporary state. Pick the closest category:
  injury (sore/strained/tweaked body part), illness (cold, flu, sick), travel (trips), stress (deadlines, busy week), poor_sleep (a bad night), fatigue (tired, drained), other.

RULES
- One action per distinct fact. Labels are short and specific, max 8 words, in third person without the user's name (e.g. "Sore knee since Sunday's long run").
- If the message mentions something already in memory, use "refresh" with its memory_id. Never create a duplicate.
- If the user says something is over (better, healed, gone, done, achieved), use "resolve".
- If a PENDING CHECK-IN exists and the message answers it: still true -> "refresh"; better or gone -> "resolve".
- Set end_date only when the user states when a moment ends; convert relative dates using TODAY.
- Greetings, questions and chit-chat without new facts -> {"actions": []}.

EXAMPLES
Message: "Training for a half-marathon in November. I'm allergic to peanuts. Knee's been sore since Sunday's long run, and I slept terribly last night."
-> {"actions":[{"op":"create","tier":"goal","text":"Half-marathon in November"},{"op":"create","tier":"core","text":"Allergic to peanuts"},{"op":"create","tier":"moment","category":"injury","text":"Sore knee since Sunday's long run"},{"op":"create","tier":"moment","category":"poor_sleep","text":"Slept terribly last night"}]}

Message: "What should I do today, and what should I eat after?"
-> {"actions":[]}

Message: "How's my sleep been lately?"
-> {"actions":[]}

Existing: [m3] Sore knee since Sunday's long run (PENDING CHECK-IN)
Message: "All good now"
-> {"actions":[{"op":"resolve","memory_id":3}]}

Existing: [m3] Sore knee since Sunday's long run (PENDING CHECK-IN)
Message: "Still a bit sore honestly"
-> {"actions":[{"op":"refresh","memory_id":3}]}

Existing: [m5] Sore knee
Message: "ugh the knee is acting up again"
-> {"actions":[{"op":"refresh","memory_id":5}]}

Message: "I'm type 1 diabetic and I've gone vegetarian"
-> {"actions":[{"op":"create","tier":"core","text":"Type 1 diabetes"},{"op":"create","tier":"core","text":"Vegetarian"}]}

Message (TODAY 2026-09-26): "Flying to Denver Thursday for work, back Sunday"
-> {"actions":[{"op":"create","tier":"moment","category":"travel","text":"Work trip to Denver","end_date":"2026-10-04"}]}

Message: "Deadlines are killing me this week"
-> {"actions":[{"op":"create","tier":"moment","category":"stress","text":"Deadline-heavy week at work"}]}`;

function describe(m: MemoryView) {
  const flags = [m.tier.toUpperCase(), m.category, m.status === "checkin" ? "PENDING CHECK-IN" : null]
    .filter(Boolean)
    .join(", ");
  return `[m${m.id}] ${m.text} (${flags})`;
}

export type MemoryChange = { op: "create" | "refresh" | "resolve" | "update"; memory: MemoryView };

export async function buildMemories(userText: string, previousCoachText: string | null, sourceMessageId: number) {
  const now = simNow();
  const existing = liveMemories().map((m) => toView(m, now));
  const input = `TODAY: ${localDate(now)} (${now.toLocaleDateString("en-US", { weekday: "long" })})

EXISTING MEMORIES
${existing.length ? existing.map(describe).join("\n") : "(none)"}

COACH'S PREVIOUS MESSAGE
${previousCoachText ?? "(none)"}

USER'S NEW MESSAGE
${userText}`;

  const out = await generateJson<{ actions: Action[] }>({ system: SYSTEM, input, schema: SCHEMA });
  return applyActions(out.actions ?? [], sourceMessageId);
}

export function applyActions(actions: Action[], sourceMessageId: number): MemoryChange[] {
  const changes: MemoryChange[] = [];
  const live = new Map(liveMemories().map((m) => [m.id, m]));
  const push = (op: MemoryChange["op"], m: Memory | undefined) => {
    if (m) changes.push({ op, memory: toView(m) });
  };

  for (const a of actions) {
    if (a.op === "create" && a.text && a.tier) {
      const dupe = [...live.values()].find((m) => m.text.toLowerCase() === a.text.toLowerCase());
      if (dupe) {
        push("refresh", refreshMemory(dupe.id));
        continue;
      }
      const m = createMemory({
        tier: a.tier,
        category: a.tier === "moment" ? a.category ?? "other" : null,
        text: a.text,
        endDate: a.tier === "moment" && a.end_date && /^\d{4}-\d{2}-\d{2}$/.test(a.end_date) ? a.end_date : null,
        sourceMessageId,
      });
      live.set(m.id, m);
      push("create", m);
    } else if (a.op === "refresh" && live.has(a.memory_id)) {
      push("refresh", refreshMemory(a.memory_id));
    } else if (a.op === "resolve" && live.has(a.memory_id)) {
      push("resolve", resolveMemory(a.memory_id));
    } else if (a.op === "update" && live.has(a.memory_id) && a.text) {
      push("update", updateMemoryText(a.memory_id, a.text));
    }
  }
  return changes;
}
