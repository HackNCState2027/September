"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** A quiet interstitial while the memory clock jumps forward (or back). */
export default function TimeWarp({ from, days, back = false }: { from: string; days: number; back?: boolean }) {
  const reduce = useReducedMotion();
  const start = new Date(from + "T12:00:00");
  const [shown, setShown] = useState(reduce ? days : 0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setShown((n) => (n < days ? n + 1 : n)), 190);
    return () => clearInterval(id);
  }, [days, reduce]);

  const current = new Date(start);
  current.setDate(current.getDate() + (back ? -shown : shown));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "color-mix(in srgb, var(--tempo-paper) 96%, transparent)" }}
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="tempo-eyebrow">Memory clock</div>
        <div className="tempo-display mt-3 text-[44px]">
          {days === 7 ? "Seven" : days} days {back ? "earlier" : "later"}.
        </div>
        <div className="mt-4 font-serif text-[18px] tabular-nums text-ink-soft">{fmt(current)}</div>
        <div className="mx-auto mt-5 flex w-56 gap-1" aria-hidden>
          {Array.from({ length: days }, (_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors duration-200"
              style={{
                background: (back ? days - 1 - i < shown : i < shown) ? "var(--tempo-coral)" : "var(--tempo-line)",
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
