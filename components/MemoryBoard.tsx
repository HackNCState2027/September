"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { MemoryView, Tier } from "@/lib/types";
import { CheckIcon, TierIcon } from "./Icons";
import LifespanRing from "./LifespanRing";
import { ringColor, statusLine, TIER_META } from "./tiers";

const TIERS: Tier[] = ["core", "goal", "moment"];
const EASE = [0.22, 1, 0.36, 1] as const;

export default function MemoryBoard({
  memories,
  history,
  glowIds,
  learning,
  highlightId,
  sourceOf,
}: {
  memories: MemoryView[];
  history: MemoryView[];
  glowIds: Set<number>;
  learning: boolean;
  highlightId: number | null;
  sourceOf: (m: MemoryView) => string | undefined;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3">
        <div>
          <div className="tempo-eyebrow">Memory</div>
          <h2 className="tempo-display mt-1 text-[22px] whitespace-nowrap">What your coach remembers</h2>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {learning ? (
            <motion.div
              key="learning"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-1 flex items-center gap-1.5 rounded-control bg-surface-strong px-2 py-1 text-[11px] font-semibold text-sage ring-1 ring-line"
              role="status"
            >
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-sage" />
              Learning…
            </motion.div>
          ) : (
            <motion.div key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tempo-eyebrow mt-1.5">
              {memories.length} active
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {TIERS.map((tier) => {
          const meta = TIER_META[tier];
          const list = memories.filter((m) => m.tier === tier);
          return (
            <section key={tier} aria-label={`${meta.label} memories`}>
              <div className="mb-2 flex items-center gap-2">
                <span style={{ color: meta.color }}>
                  <TierIcon tier={tier} size={14} />
                </span>
                <span className="text-[12px] font-semibold tracking-wide text-ink">{meta.label}</span>
                <span className="text-[11px] text-muted">{meta.rule}</span>
              </div>
              <div className="space-y-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {list.map((m) => (
                    <MemoryCard
                      key={m.id}
                      m={m}
                      glow={glowIds.has(m.id)}
                      highlighted={highlightId === m.id}
                      source={sourceOf(m)}
                    />
                  ))}
                </AnimatePresence>
                {list.length === 0 && (
                  <div className="rounded-card border border-dashed border-line px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                    Nothing yet. For example: {meta.examples.toLowerCase()}.
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {history.length > 0 && (
          <section aria-label="Resolved memories">
            <button
              onClick={() => setShowHistory((s) => !s)}
              aria-expanded={showHistory}
              className="tempo-press flex items-center gap-2 text-[12px] font-semibold text-ink-soft hover:text-ink"
            >
              <CheckIcon size={13} className="text-sage" /> History ({history.length})
              <span className="text-[10px] text-muted">{showHistory ? "Hide" : "Show"}</span>
            </button>
            <AnimatePresence initial={false}>
              {showHistory && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-1.5 overflow-hidden"
                >
                  {history.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-[12px] text-ink-soft">
                      <CheckIcon size={12} className="text-sage" />
                      <span>{m.text}</span>
                      <span className="text-[10px] text-muted">· Confirmed resolved</span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>

      <div className="border-t border-line px-5 py-2.5 text-[10px] leading-relaxed text-muted">
        The ring shows how much time a memory has left. Core facts and goals never fade; moments do, and
        your coach checks in before letting go of anything that affects your training.
      </div>
    </div>
  );
}

function MemoryCard({
  m,
  glow,
  highlighted,
  source,
}: {
  m: MemoryView;
  glow: boolean;
  highlighted: boolean;
  source: string | undefined;
}) {
  const [hover, setHover] = useState(false);
  const meta = TIER_META[m.tier];
  const fading = m.status === "fading";
  const checkin = m.status === "checkin";
  const status = statusLine(m);
  const emphasis = glow || highlighted || hover;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: fading ? 0.55 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.45, ease: EASE } }}
      transition={{ duration: 0.4, ease: EASE }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      tabIndex={0}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label={`${meta.label}: ${m.text}. ${status}.`}
      className={`rounded-card border px-3 py-2.5 outline-none ${checkin ? "memory-checkin" : ""}`}
      style={{
        background: meta.soft,
        borderColor: checkin ? "var(--tempo-amber)" : emphasis ? meta.color : "transparent",
        // Explicit "none": motion keeps a stale inline value when a style key becomes undefined.
        boxShadow: glow ? `0 0 0 3px color-mix(in srgb, ${meta.color} 18%, transparent)` : "none",
        transition: "border-color 0.5s, box-shadow 0.6s",
      }}
    >
      <div className="flex items-center gap-3">
        <LifespanRing strength={m.strength} color={ringColor(m)} label={status}>
          <span style={{ color: meta.color }}>
            <TierIcon tier={m.tier} size={13} />
          </span>
        </LifespanRing>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug text-ink">{m.text}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
            <span style={{ color: checkin || fading ? "var(--tempo-amber)" : undefined }} className={checkin ? "font-semibold" : ""}>
              {status}
            </span>
            {m.category && <span>· {m.category.replace("_", " ")}</span>}
            {glow && <span className="font-semibold" style={{ color: meta.color }}>· Just learned</span>}
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {hover && source && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-soft">
              <span className="tempo-eyebrow mr-1.5 !text-[9px]">Learned from</span>“{source}”
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
