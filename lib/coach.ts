import { ai, COACH_MODEL } from "./gemini";
import { simNow } from "./clock";
import { liveMemories, toView } from "./memoryEngine";
import { recentMessages } from "./messages";
import { runTool, todaySummary, TOOL_DECLARATIONS } from "./tools";
import type { Chip, Memory, MemoryView, ToolCallRecord } from "./types";

const HISTORY_MESSAGES = 12;
const MAX_TOOL_ROUNDS = 3;

export const TAG_RE = /\[\[?(m\d+|today)\]\]?/g;

export function userName() {
  return process.env.USER_NAME || "Alex";
}

function memoryLine(m: MemoryView) {
  const left = m.days_left != null ? ` (${m.days_left} day${m.days_left === 1 ? "" : "s"} left)` : "";
  return `[m${m.id}] ${m.text}${left}`;
}

export function buildSystemPrompt(memories: Memory[]): string {
  const now = simNow();
  const views = memories.map((m) => toView(m, now));
  const section = (title: string, list: MemoryView[]) =>
    `${title}\n${list.length ? list.map(memoryLine).join("\n") : "(none)"}`;

  return `You are ${userName()}'s personal fitness coach. Be warm, direct and brief: 2-5 sentences, optionally a short bullet list. Talk like a real coach who knows them, not a textbook.

Today is ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.

HARD RULES
- Never suggest anything that conflicts with a CORE fact (allergens, conditions, medications, diet). If a common suggestion would conflict, pick a safe alternative without making a fuss about it.
- Adapt training to active MOMENTS (injuries, illness, stress, poor sleep) and keep GOALS in mind.
- Only quote numbers that appear in TODAY'S DATA or in tool results. For any question about trends, "lately", "this week", or comparisons, call get_range first. Never invent data.
- When your answer relies on a memory, tag it inline right after the relevant phrase like [[m12]]. When it relies on today's data, tag [[today]]. Tags are hidden from the user and become chips, so use them naturally and don't mention them.
- If there are PENDING CHECK-INS and the user's message answers one, acknowledge it briefly and say how the plan changes.
- You are not a doctor. For anything beyond fitness, suggest a professional in one short phrase.

${section("CORE (never forget, always respect)", views.filter((m) => m.tier === "core"))}

${section("GOALS", views.filter((m) => m.tier === "goal"))}

${section("MOMENTS (temporary)", views.filter((m) => m.tier === "moment" && m.status !== "checkin"))}

${section("PENDING CHECK-INS (you asked whether these still apply)", views.filter((m) => m.status === "checkin"))}

TODAY'S DATA
${todaySummary()}`;
}

type StreamEvent = {
  event_type: string;
  index?: number;
  interaction?: { id?: string; steps?: StepLike[] };
  step?: StepLike;
  delta?: { type: string; text?: string; arguments?: string };
};
type StepLike = {
  type: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  content?: { type: string; text?: string }[];
};

interface PendingCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsText: string;
}

export async function runCoach(handlers: {
  onText: (delta: string) => void;
  onTool: (call: ToolCallRecord) => void;
}): Promise<{ text: string; chips: Chip[]; toolCalls: ToolCallRecord[] }> {
  const memories = liveMemories();
  const system = buildSystemPrompt(memories);

  let input: unknown = recentMessages(HISTORY_MESSAGES).map((m) => ({
    type: m.role === "user" ? "user_input" : "model_output",
    content: [{ type: "text", text: m.text }],
  }));
  let previousId: string | undefined;
  let fullText = "";
  const toolCalls: ToolCallRecord[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = (await ai().interactions.create({
      model: COACH_MODEL,
      system_instruction: system,
      input: input as never,
      tools: TOOL_DECLARATIONS,
      generation_config: { thinking_level: "low" },
      previous_interaction_id: previousId,
      stream: true,
    })) as unknown as AsyncIterable<StreamEvent>;

    const calls = new Map<number, PendingCall>();
    for await (const ev of stream) {
      if (ev.event_type === "interaction.created" || ev.event_type === "interaction.completed") {
        if (ev.interaction?.id) previousId = ev.interaction.id;
        // Fallback: pick up complete function calls from the final interaction.
        for (const [i, s] of (ev.interaction?.steps ?? []).entries()) {
          if (s.type === "function_call" && s.id && !hasCall(calls, s.id)) {
            calls.set(1000 + i, { id: s.id, name: s.name ?? "", args: s.arguments ?? {}, argsText: "" });
          }
        }
      } else if (ev.event_type === "step.start" && ev.step) {
        if (ev.step.type === "function_call") {
          calls.set(ev.index ?? calls.size, {
            id: ev.step.id ?? "",
            name: ev.step.name ?? "",
            args: ev.step.arguments ?? {},
            argsText: "",
          });
        } else if (ev.step.type === "model_output") {
          for (const c of ev.step.content ?? []) {
            if (c.type === "text" && c.text) {
              fullText += c.text;
              handlers.onText(c.text);
            }
          }
        }
      } else if (ev.event_type === "step.delta" && ev.delta) {
        if (ev.delta.type === "text" && ev.delta.text) {
          fullText += ev.delta.text;
          handlers.onText(ev.delta.text);
        } else if (ev.delta.type === "arguments_delta" && ev.delta.arguments) {
          const c = calls.get(ev.index ?? -1);
          if (c) c.argsText += ev.delta.arguments;
        }
      } else if (ev.event_type === "error") {
        throw new Error(`Gemini stream error: ${JSON.stringify(ev)}`);
      }
    }

    if (calls.size === 0 || round === MAX_TOOL_ROUNDS) break;

    const results = [];
    for (const c of calls.values()) {
      const args = c.argsText ? safeJson(c.argsText) ?? c.args : c.args;
      const out = runTool(c.name, args);
      const record: ToolCallRecord = { name: c.name, args, label: out.label, chart: out.chart };
      toolCalls.push(record);
      handlers.onTool(record);
      results.push({ type: "function_result", call_id: c.id, name: c.name, result: JSON.stringify(out.result) });
    }
    input = results;
  }

  return { text: fullText, chips: buildChips(fullText, memories, toolCalls), toolCalls };
}

function buildChips(text: string, memories: Memory[], toolCalls: ToolCallRecord[]): Chip[] {
  const now = simNow();
  const byId = new Map(memories.map((m) => [m.id, m]));
  const chips: Chip[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(TAG_RE)) {
    const tag = match[1];
    if (seen.has(tag)) continue;
    seen.add(tag);
    if (tag === "today") {
      chips.push({ kind: "data", label: "today" });
      continue;
    }
    const m = byId.get(Number(tag.slice(1)));
    if (m) {
      const v = toView(m, now);
      chips.push({ kind: "memory", id: m.id, tier: m.tier, label: m.text, daysLeft: v.days_left });
    }
  }
  for (const t of toolCalls) {
    if (!seen.has(t.label)) {
      seen.add(t.label);
      chips.push({ kind: "data", label: t.label });
    }
  }
  return chips;
}

function hasCall(calls: Map<number, PendingCall>, id: string) {
  for (const c of calls.values()) if (c.id === id) return true;
  return false;
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
