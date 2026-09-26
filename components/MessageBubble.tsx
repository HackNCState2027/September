"use client";

import { motion } from "motion/react";
import type { Chip, Message } from "@/lib/types";
import MiniChart from "./MiniChart";
import { stripTags, TIER_META } from "./tiers";

export type UIMessage = Message & { streaming?: boolean };

export default function MessageBubble({ msg }: { msg: UIMessage }) {
  if (msg.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-white">
          {msg.text}
        </div>
      </motion.div>
    );
  }

  const text = stripTags(msg.text);
  const chart = msg.tool_calls.find((t) => t.chart)?.chart;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm text-white">
        C
      </div>
      <div className="max-w-[85%] min-w-0">
        {msg.kind === "checkin" && (
          <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
            💬 Coach checked in on its own
          </div>
        )}
        <div
          className={`rounded-2xl rounded-tl-md border bg-panel px-4 py-3 text-[15px] leading-relaxed ${
            msg.kind === "checkin" ? "border-warn" : "border-line"
          }`}
        >
          {msg.streaming &&
            msg.tool_calls.map((t, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
                <span>🔎</span> fetching {t.label}…
              </div>
            ))}
          {text ? <RichText text={text} /> : msg.streaming ? <Typing /> : null}
          {chart && !msg.streaming && <MiniChart chart={chart} />}
        </div>
        {!msg.streaming && msg.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted">Based on</span>
            {msg.chips.map((c, i) => (
              <ChipView key={i} chip={c} i={i} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ChipView({ chip, i }: { chip: Chip; i: number }) {
  const style =
    chip.kind === "memory"
      ? { background: TIER_META[chip.tier].soft, color: TIER_META[chip.tier].color }
      : { background: "var(--line)", color: "var(--ink)" };
  const label =
    chip.kind === "memory"
      ? `${TIER_META[chip.tier].icon} ${chip.label}${chip.daysLeft != null ? ` · ${chip.daysLeft}d left` : ""}`
      : `📊 ${chip.label}`;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.08 * i }}
      className="rounded-full px-2.5 py-1 text-xs font-medium"
      style={style}
    >
      {label}
    </motion.span>
  );
}

function Typing() {
  return (
    <div className="flex gap-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
      ))}
    </div>
  );
}

/** Tiny markdown: paragraphs, "- " bullets, **bold**. */
function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
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
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
