"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Persona } from "@/lib/types";
import { CheckIcon } from "./Icons";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function PersonaPicker({
  current,
  presets,
  onPick,
  onCustom,
  onClose,
}: {
  current: Persona;
  presets: Persona[];
  onPick: (id: string) => void;
  onCustom: (description: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease: EASE }}
      role="dialog"
      aria-label="Choose your coach's persona"
      className="absolute top-full right-0 z-40 mt-2 max-h-[calc(100vh-200px)] w-[460px] overflow-y-auto rounded-panel border border-line bg-surface-strong p-4 shadow-[0_8px_30px_rgba(48,58,50,0.08)]"
    >
      <div className="tempo-eyebrow">Coach persona</div>
      <h3 className="tempo-display mt-1 text-[20px]">How should your coach talk?</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        Changes the voice only. What your coach remembers and its safety rules stay exactly the same.
      </p>

      <div className="mt-3 space-y-1" role="radiogroup">
        {presets.map((p) => {
          const active = !current.custom && current.id === p.id;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={active}
              onClick={() => onPick(p.id)}
              className="tempo-press flex w-full items-center gap-3 rounded-card border px-3 py-1.5 text-left hover:border-sage"
              style={{
                borderColor: active ? "var(--tempo-sage)" : "var(--tempo-line)",
                background: active ? "var(--tempo-moment-soft)" : "var(--tempo-surface)",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-ink">{p.name}</span>
                  <span className="text-[11px] text-muted">{p.tagline}</span>
                </div>
                <div className="truncate font-serif text-[12px] leading-snug text-ink-soft italic" title={p.sample}>“{p.sample}”</div>
              </div>
              {active && <CheckIcon size={14} className="shrink-0 text-sage" />}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) onCustom(custom.trim());
        }}
        className="mt-3 border-t border-line pt-3"
      >
        <label htmlFor="custom-persona" className="tempo-eyebrow !text-[9px]">
          Or describe your own
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="custom-persona"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={current.custom ? `Now: ${current.name}` : "e.g. like a pirate captain"}
            maxLength={300}
            className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none placeholder:text-muted focus:border-sage focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={!custom.trim()}
            className="tempo-button-primary px-3 py-1.5 text-[12px] disabled:opacity-40"
          >
            Use this voice
          </button>
        </div>
      </form>
    </motion.div>
  );
}
