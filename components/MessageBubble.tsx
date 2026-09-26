"use client";

import { motion } from "motion/react";
import type { Chip, Message } from "@/lib/types";
import { LookBackIcon, TempoMark, TierIcon } from "./Icons";
import MiniChart from "./MiniChart";
import { stripTags, TIER_META } from "./tiers";

export type UIMessage = Message & { streaming?: boolean };

const EASE = [0.22, 1, 0.36, 1] as const;

export default function MessageBubble({
  msg,
  onHoverMemory,
  quickReplies,
  onQuickReply,
}: {
  msg: UIMessage;
  onHoverMemory: (id: number | null) => void;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
}) {
  if (msg.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex justify-end"
      >
        <div className="max-w-[78%] rounded-card rounded-br-[3px] bg-ink px-4 py-2.5 text-[14px] leading-[1.7] text-surface-strong">
          {msg.text}
        </div>
      </motion.div>
    );
  }

  const text = stripTags(msg.text);
  const chart = msg.tool_calls.find((t) => t.chart)?.chart;
  const checkin = msg.kind === "checkin";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex gap-3"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-strong">
        <TempoMark size={18} />
      </div>
      <div className="max-w-[86%] min-w-0">
        {checkin && <div className="tempo-eyebrow mb-1.5 !text-amber">Check-in · your coach reached out</div>}
        <div
          className="rounded-card rounded-tl-[3px] border bg-surface-strong px-4 py-3 text-[14px] leading-[1.8] text-ink"
          style={{ borderColor: checkin ? "var(--tempo-amber)" : "var(--tempo-line)" }}
        >
          {msg.streaming &&
            msg.tool_calls.map((t, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-1.5 text-[11px] text-sage">
                <LookBackIcon size={13} /> Looking back: {t.label}…
              </div>
            ))}
          {text ? (
            <RichText text={text} />
          ) : msg.streaming ? (
            <div className="flex gap-1 py-2" role="status" aria-label="Your coach is writing">
              {[0, 1, 2].map((i) => (
                <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-sage" />
              ))}
            </div>
          ) : null}
          {chart && !msg.streaming && <MiniChart chart={chart} />}
        </div>

        {!msg.streaming && msg.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="tempo-eyebrow mr-0.5 !text-[9px]">Based on</span>
            {msg.chips.map((c, i) => (
              <ChipView key={i} chip={c} onHoverMemory={onHoverMemory} />
            ))}
          </div>
        )}

        {quickReplies && onQuickReply && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3, ease: EASE }}
            className="mt-2.5 flex flex-wrap gap-2"
          >
            {quickReplies.map((r) => (
              <button
                key={r}
                onClick={() => onQuickReply(r)}
                className="tempo-press rounded-control border border-sage bg-surface-strong px-3 py-1.5 text-[12px] font-semibold text-sage hover:bg-sage hover:text-surface-strong"
              >
                {r}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function ChipView({ chip, onHoverMemory }: { chip: Chip; onHoverMemory: (id: number | null) => void }) {
  if (chip.kind === "data") {
    return (
      <span className="rounded-control border border-line bg-surface-strong px-2 py-0.5 text-[11px] text-ink-soft">
        {chip.label === "today" ? "Today’s health snapshot" : chip.label}
      </span>
    );
  }
  const meta = TIER_META[chip.tier];
  return (
    <span
      onMouseEnter={() => onHoverMemory(chip.id)}
      onMouseLeave={() => onHoverMemory(null)}
      className="inline-flex cursor-default items-center gap-1 rounded-control px-2 py-0.5 text-[11px] text-ink"
      style={{ background: meta.soft }}
      title="Highlight this memory on the board"
    >
      <span style={{ color: meta.color }}>
        <TierIcon tier={chip.tier} size={11} />
      </span>
      {chip.label}
      {chip.daysLeft != null && <span className="text-muted">· {chip.daysLeft}d left</span>}
    </span>
  );
}

/** Tiny markdown: paragraphs, "- " bullets, **bold**. */
function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-sage">
              {lines.map((l, j) => (
                <li key={j}>{bold(l.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {bold(l.replace(/^\s*[-*•]\s+/, "• "))}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function bold(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
