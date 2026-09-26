import type { MemoryView, Tier } from "@/lib/types";

export const TIER_META: Record<Tier, { icon: string; label: string; color: string; soft: string; hint: string }> = {
  core: { icon: "🔒", label: "Core", color: "var(--core)", soft: "var(--core-soft)", hint: "Never forgotten" },
  goal: { icon: "🎯", label: "Goals", color: "var(--goal)", soft: "var(--goal-soft)", hint: "Kept until done" },
  moment: { icon: "🌊", label: "Moments", color: "var(--moment)", soft: "var(--moment-soft)", hint: "Fade on their own" },
};

export function ringColor(m: MemoryView) {
  if (m.status === "checkin" || m.status === "fading") return "var(--warn)";
  return TIER_META[m.tier].color;
}

export function statusLine(m: MemoryView) {
  if (m.tier === "core") return "Never fades";
  if (m.tier === "goal") return "Until done";
  if (m.status === "checkin") return "Checking in…";
  if (m.status === "fading") return `Fading · ${m.days_left}d left`;
  return `${m.days_left}d left`;
}

/** Hide [[m12]] / [[today]] tags, including a half-streamed one at the end. */
export function stripTags(text: string) {
  return text.replace(/\[\[?(m\d+|today)\]\]?/g, "").replace(/\[\[?[a-z0-9]*$/i, "").replace(/ +([.,;:!?])/g, "$1");
}
