import type { MemoryView, Tier } from "@/lib/types";

export const TIER_META: Record<
  Tier,
  { label: string; color: string; soft: string; rule: string; examples: string }
> = {
  core: {
    label: "Core",
    color: "var(--tempo-core)",
    soft: "var(--tempo-core-soft)",
    rule: "Never forgotten",
    examples: "Allergies, conditions, medications",
  },
  goal: {
    label: "Goals",
    color: "var(--tempo-goal)",
    soft: "var(--tempo-goal-soft)",
    rule: "Kept until done",
    examples: "A race, a target, a habit",
  },
  moment: {
    label: "Moments",
    color: "var(--tempo-moment)",
    soft: "var(--tempo-moment-soft)",
    rule: "Fade on their own",
    examples: "A sore knee, a busy week, a trip",
  },
};

export function ringColor(m: MemoryView) {
  if (m.status === "checkin" || m.status === "fading") return "var(--tempo-amber)";
  return TIER_META[m.tier].color;
}

const days = (n: number | null) => `${n ?? 0} day${n === 1 ? "" : "s"}`;

/** Always paired with the ring colour so state never relies on colour alone. */
export function statusLine(m: MemoryView) {
  if (m.status === "resolved") return "Confirmed resolved";
  if (m.tier === "core") return "Never fades";
  if (m.tier === "goal") return "Kept until done";
  if (m.status === "checkin") return "Awaiting your check-in";
  if (m.status === "fading") return `Fading · ${days(m.days_left)} remaining`;
  return `${days(m.days_left)} remaining`;
}

/** Hide [[m12]] / [[today]] tags, including a half-streamed one at the end. */
export function stripTags(text: string) {
  return text.replace(/\[\[?(m\d+|today)\]\]?/g, "").replace(/\[\[?[a-z0-9]*$/i, "").replace(/ +([.,;:!?)])/g, "$1");
}
