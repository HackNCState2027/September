"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { MemoryView, Tier } from "@/lib/types";
import LifespanRing from "./LifespanRing";
import { ringColor, statusLine, TIER_META } from "./tiers";

const TIERS: Tier[] = ["core", "goal", "moment"];

export default function MemoryBoard({
  memories,
  history,
  glowIds,
  learning,
}: {
  memories: MemoryView[];
  history: MemoryView[];
  glowIds: Set<number>;
  learning: boolean;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h2 className="text-[15px] font-semibold tracking-tight">What your coach remembers</h2>
        <AnimatePresence mode="wait" initial={false}>
          {learning ? (
            <motion.span
              key="learning"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 rounded-full bg-goal-soft px-2 py-0.5 text-xs font-semibold text-goal"
            >
              <span className="animate-pulse">🧠</span> Learning…
            </motion.span>
          ) : (
            <motion.span key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted">
              {memories.length} live
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5">
        {TIERS.map((tier) => {
          const meta = TIER_META[tier];
          const list = memories.filter((m) => m.tier === tier);
          return (
            <section key={tier}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm">{meta.icon}</span>
                <span className="text-[13px] font-semibold" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="text-xs text-muted">· {meta.hint}</span>
              </div>
              <div className="space-y-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {list.map((m) => (
                    <MemoryCard key={m.id} m={m} glow={glowIds.has(m.id)} />
                  ))}
                </AnimatePresence>
                {list.length === 0 && (
                  <div className="rounded-xl border border-dashed border-line px-3 py-3 text-xs text-muted">
                    Nothing yet. I learn as we talk.
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {history.length > 0 && (
          <section>
            <button
              onClick={() => setShowHistory((s) => !s)}
              className="flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-ink"
            >
              <span>✓</span> History ({history.length}) <span className="text-xs">{showHistory ? "▾" : "▸"}</span>
            </button>
            <AnimatePresence initial={false}>
              {showHistory && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-1 overflow-hidden"
                >
                  {history.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-xs text-muted">
                      <span className="text-moment">✓</span>
                      <span className="line-through decoration-line">{m.text}</span>
                      <span>· resolved</span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>
    </div>
  );
}

function MemoryCard({ m, glow }: { m: MemoryView; glow: boolean }) {
  const meta = TIER_META[m.tier];
  const fading = m.status === "fading";
  const checkin = m.status === "checkin";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85, y: -8 }}
      animate={{ opacity: fading ? 0.5 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: 30, transition: { duration: 0.45 } }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`flex items-center gap-3 rounded-xl border bg-panel px-3 py-2.5 ${checkin ? "checkin-pulse" : ""}`}
      style={{
        borderColor: checkin ? "var(--warn)" : glow ? meta.color : "var(--line)",
        boxShadow: glow ? `0 0 0 3px ${meta.soft}` : undefined,
        transition: "border-color 0.6s, box-shadow 0.6s",
      }}
    >
      <LifespanRing strength={m.strength} color={ringColor(m)}>
        {meta.icon}
      </LifespanRing>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium leading-tight">{m.text}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span style={{ color: checkin || fading ? "var(--warn)" : undefined }}>{statusLine(m)}</span>
          {m.category && <span>· {m.category.replace("_", " ")}</span>}
          {glow && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-full px-1.5 py-px text-[10px] font-semibold"
              style={{ background: meta.soft, color: meta.color }}
            >
              just learned
            </motion.span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
