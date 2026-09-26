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

/** Every field required: with optional fields Gemini takes the shortest valid path and drops labels. */
const SCHEMA = {
  type: "object",
  properties: {
    create: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "Short card label, max 8 words" },
          tier: { type: "string", enum: ["core", "goal", "moment"] },
          category: {
            type: "string",
            enum: ["none", "injury", "illness", "travel", "stress", "poor_sleep", "fatigue", "other"],
          },
          end_date: { type: "string", description: "YYYY-MM-DD if the user states when it ends, else empty string" },
        },
        required: ["text", "tier", "category", "end_date"],
      },
    },
    refresh: { type: "array", items: { type: "integer" } },
    resolve: { type: "array", items: { type: "integer" } },
    update: {
      type: "array",
      items: {
        type: "object",
        properties: { memory_id: { type: "integer" }, text: { type: "string" } },
        required: ["memory_id", "text"],
      },
    },
  },
  required: ["create", "refresh", "resolve", "update"],
};

type BuilderOutput = {
  create?: { text: string; tier: Tier; category: MomentCategory | "none"; end_date: string }[];
  refresh?: number[];
  resolve?: number[];
  update?: { memory_id: number; text: string }[];
};

function toActions(out: BuilderOutput): Action[] {
  return [
    ...(out.create ?? []).map((c) => ({
      op: "create" as const,
      tier: c.tier,
      category: c.category === "none" ? undefined : c.category,
      text: c.text,
      end_date: c.end_date || undefined,
    })),
    ...(out.refresh ?? []).map((id) => ({ op: "refresh" as const, memory_id: id })),
    ...(out.resolve ?? []).map((id) => ({ op: "resolve" as const, memory_id: id })),
    ...(out.update ?? []).map((u) => ({ op: "update" as const, memory_id: u.memory_id, text: u.text })),
  ];
}

const SYSTEM = `You maintain the long-term memory of a fitness coaching app. Read the user's newest message and return memory changes as JSON with four lists: create, refresh, resolve, update (use empty lists when nothing applies).

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
- Greetings, questions and chit-chat without new facts -> all four lists empty.
- For core and goal, category is "none". end_date is "" unless the user states when a moment ends.

EXAMPLES
Message: "Training for a half-marathon in November. I'm allergic to peanuts. Knee's been sore since Sunday's long run, and I slept terribly last night."
-> {"create":[{"text":"Half-marathon in November","tier":"goal","category":"none","end_date":""},{"text":"Allergic to peanuts","tier":"core","category":"none","end_date":""},{"text":"Sore knee since Sunday's long run","tier":"moment","category":"injury","end_date":""},{"text":"Slept terribly last night","tier":"moment","category":"poor_sleep","end_date":""}],"refresh":[],"resolve":[],"update":[]}

Message: "What should I do today, and what should I eat after?"
-> {"create":[],"refresh":[],"resolve":[],"update":[]}

Message: "How's my sleep been lately?"
-> {"create":[],"refresh":[],"resolve":[],"update":[]}

Existing: [m3] Sore knee since Sunday's long run (PENDING CHECK-IN)
Message: "All good now"
-> {"create":[],"refresh":[],"resolve":[3],"update":[]}

Existing: [m3] Sore knee since Sunday's long run (PENDING CHECK-IN)
Message: "Still a bit sore honestly"
-> {"create":[],"refresh":[3],"resolve":[],"update":[]}

Existing: [m5] Sore knee
Message: "ugh the knee is acting up again"
-> {"create":[],"refresh":[5],"resolve":[],"update":[]}

Message: "I'm type 1 diabetic and I've gone vegetarian"
-> {"create":[{"text":"Type 1 diabetes","tier":"core","category":"none","end_date":""},{"text":"Vegetarian","tier":"core","category":"none","end_date":""}],"refresh":[],"resolve":[],"update":[]}

Message (TODAY 2026-09-26): "Flying to Denver Thursday for work, back Sunday"
-> {"create":[{"text":"Work trip to Denver","tier":"moment","category":"travel","end_date":"2026-10-04"}],"refresh":[],"resolve":[],"update":[]}

Message: "Deadlines are killing me this week"
-> {"create":[{"text":"Deadline-heavy week at work","tier":"moment","category":"stress","end_date":""}],"refresh":[],"resolve":[],"update":[]}`;

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

  const out = await generateJson<BuilderOutput>({ system: SYSTEM, input, schema: SCHEMA });
  if (process.env.DEBUG_MEMORY) console.log("[memory builder] raw", JSON.stringify(out));
  return applyActions(toActions(out), sourceMessageId);
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
