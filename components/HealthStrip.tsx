"use client";

import type { TodayMetric, TodaySnapshot } from "@/lib/types";
import { SyncIcon } from "./Icons";
import Sparkline from "./Sparkline";

/** Guide recipe: sleep, HRV, steps, plus a source note. Not a dense metrics grid. */
const SHOWN: TodayMetric["key"][] = ["sleep", "hrv", "steps"];

export default function HealthStrip({
  today,
  dataSource,
  lastSyncAt,
  syncing,
  onSync,
  onSample,
}: {
  today: TodaySnapshot | null;
  dataSource: "google_health" | "sample" | "none";
  lastSyncAt: string | null;
  syncing: boolean;
  onSync: () => void;
  onSample: () => void;
}) {
  const metrics = (today?.metrics ?? []).filter((m) => SHOWN.includes(m.key));
  return (
    <div className="flex items-stretch gap-0 rounded-panel border border-line bg-surface-strong">
      {metrics.map((m, i) => (
        <div key={m.key} className={`flex flex-1 items-center justify-between gap-3 px-5 py-3 ${i > 0 ? "border-l border-line" : ""}`}>
          <div>
            <div className="tempo-eyebrow">{m.label}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-serif text-[22px] leading-none text-ink">{m.value}</span>
              {m.unit && <span className="text-[11px] text-muted">{m.unit}</span>}
            </div>
            <Delta m={m} />
          </div>
          <Sparkline values={m.series} />
        </div>
      ))}
      <div className="flex w-[210px] shrink-0 flex-col justify-center gap-1 border-l border-line px-5 py-3">
        <div className="tempo-eyebrow">Source</div>
        <div className="text-[12px] leading-snug text-ink-soft">
          {dataSource === "google_health" ? "Your Fitbit, via Google Health" : "Sample data (demo)"}
        </div>
        <button
          onClick={onSync}
          onDoubleClick={onSample}
          disabled={syncing}
          title="Click to sync Google Health. Double-click to load sample data."
          className="tempo-press flex items-center gap-1 self-start text-[11px] text-sage hover:text-ink disabled:opacity-50"
        >
          <SyncIcon size={11} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : lastSyncAt ? `Synced ${timeAgo(lastSyncAt)} · Sync now` : "Sync now"}
        </button>
      </div>
    </div>
  );
}

function Delta({ m }: { m: TodayMetric }) {
  if (m.delta == null) {
    return <div className="mt-1 text-[10px] text-muted">Today, still counting</div>;
  }
  if (m.delta === 0) return <div className="mt-1 text-[10px] text-muted">Level with your 7-day average</div>;
  const good = m.delta > 0 === (m.goodWhen === "up");
  return (
    <div className="mt-1 text-[10px]" style={{ color: good ? "var(--tempo-sage)" : "var(--tempo-amber)" }}>
      {m.delta > 0 ? "↑" : "↓"} {Math.abs(m.delta)}% vs your 7-day average
    </div>
  );
}

export function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
