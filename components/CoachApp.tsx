"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, ChatEvent, MemoryView } from "@/lib/types";
import HealthStrip from "./HealthStrip";
import { ArrowIcon, PlusIcon, TempoMark, TierIcon } from "./Icons";
import { TIER_META } from "./tiers";
import MemoryBoard from "./MemoryBoard";
import MessageBubble, { type UIMessage } from "./MessageBubble";
import TimeWarp from "./TimeWarp";

const APP_NAME = "Tempo";
const FAST_FORWARD_DAYS = 7;

/** Demo script lines. Clicking a suggestion fills the input; the presenter presses Enter. */
const SUGGESTIONS = [
  {
    label: "Introduce yourself",
    text: "Training for a half-marathon in November. I'm allergic to peanuts. My knee's been sore since my last long run, and work has been super stressful this week.",
  },
  { label: "Plan my day", text: "What should I do today, and what should I eat after?" },
  { label: "My sleep lately", text: "How's my sleep been lately?" },
];

/** Starter cards on the empty conversation; clicking one sends it. */
const STARTERS = [
  { title: "Tell me about you", body: "Your goals, anything to avoid, and how this week is going.", text: SUGGESTIONS[0].text },
  { title: "Plan today", body: "What to train, and what to eat after, based on how you slept.", text: SUGGESTIONS[1].text },
  { title: "Look back", body: "How your sleep has been trending this past week.", text: SUGGESTIONS[2].text },
];

/** In a new conversation, when the coach already knows you. */
const RETURNING_STARTERS = [
  { title: "What do you remember?", body: "See what your coach carried over from before.", text: "What do you remember about me?" },
  STARTERS[1],
  STARTERS[2],
];

const CHECKIN_REPLIES = ["All good now", "Still bothering me"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Meta = Omit<AppState, "memories" | "history" | "messages">;

export default function CoachApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [memories, setMemories] = useState<MemoryView[]>([]);
  const [history, setHistory] = useState<MemoryView[]>([]);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [glowIds, setGlowIds] = useState<Set<number>>(new Set());
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [coachTyping, setCoachTyping] = useState(false);
  const [learning, setLearning] = useState(false);
  const [warpFrom, setWarpFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const applyState = useCallback((s: AppState) => {
    const { memories: mem, history: hist, messages: msgs, ...rest } = s;
    setMeta(rest);
    setMemories(mem);
    setHistory(hist);
    setMessages(msgs);
  }, []);

  useEffect(() => {
    fetch("/api/state").then((r) => r.json()).then(applyState);
  }, [applyState]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, coachTyping]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const glow = (id: number) => {
    setGlowIds((s) => new Set(s).add(id));
    setTimeout(
      () =>
        setGlowIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        }),
      2600,
    );
  };

  const onMemoryEvent = (op: string, m: MemoryView) => {
    if (op === "resolve") {
      setMemories((list) => list.filter((x) => x.id !== m.id));
      setHistory((h) => [m, ...h.filter((x) => x.id !== m.id)]);
      return;
    }
    setMemories((list) => {
      const i = list.findIndex((x) => x.id === m.id);
      if (i === -1) return [...list, m];
      const next = [...list];
      next[i] = m;
      return next;
    });
    glow(m.id);
  };

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setInput("");
    const placeholderId = -Date.now();
    const placeholder: UIMessage = {
      id: placeholderId, role: "coach", kind: "chat", text: "", chips: [], tool_calls: [], created_at: "", streaming: true,
    };
    const pendingUser: UIMessage = { ...placeholder, id: placeholderId - 1, role: "user", text, streaming: false };
    setMessages((m) => [...m, pendingUser, placeholder]);

    const patchCoach = (fn: (m: UIMessage) => UIMessage) =>
      setMessages((list) => list.map((m) => (m.id === placeholderId ? fn(m) : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const ev = JSON.parse(part.slice(6)) as ChatEvent;
          if (ev.type === "user") {
            setMessages((list) => list.map((m) => (m.id === pendingUser.id ? ev.message : m)));
          } else if (ev.type === "learning") {
            setLearning(ev.active);
          } else if (ev.type === "memory") {
            onMemoryEvent(ev.op, ev.memory);
          } else if (ev.type === "tool") {
            patchCoach((m) => ({ ...m, tool_calls: [...m.tool_calls, ev.call] }));
          } else if (ev.type === "text") {
            patchCoach((m) => ({ ...m, text: m.text + ev.delta }));
          } else if (ev.type === "done") {
            setMessages((list) => list.map((m) => (m.id === placeholderId ? ev.message : m)));
          } else if (ev.type === "error") {
            patchCoach((m) => ({ ...m, streaming: false, text: `Sorry, something went wrong: ${ev.error}` }));
          }
        }
      }
    } catch (err) {
      patchCoach((m) => ({ ...m, streaming: false, text: `Sorry, something went wrong: ${String(err)}` }));
    } finally {
      setBusy(false);
      setLearning(false);
      inputRef.current?.focus();
    }
  }

  /** The showpiece: a quiet "seven days later", then memory transitions one at a time. */
  async function fastForward() {
    if (busy || !meta) return;
    setBusy(true);
    setWarpFrom(meta.simDate);
    try {
      const [res] = await Promise.all([
        fetch("/api/clock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: FAST_FORWARD_DAYS }),
        }),
        sleep(2000),
      ]);
      const { state } = (await res.json()) as { state: AppState };
      const { memories: nextMem, history: nextHist, messages: nextMsgs, ...rest } = state;
      setWarpFrom(null);
      setMeta(rest);
      await sleep(600);

      // Rings drain first, then whatever faded leaves the board, one by one.
      const nextById = new Map(nextMem.map((m) => [m.id, m]));
      setMemories((list) => list.map((m) => nextById.get(m.id) ?? { ...m, strength: 0, days_left: 0, status: "fading" }));
      await sleep(1100);
      const gone = memories.filter((m) => !nextById.has(m.id));
      for (const m of gone) {
        setMemories((list) => list.filter((x) => x.id !== m.id));
        await sleep(450);
      }
      setMemories(nextMem);
      setHistory(nextHist);

      const known = new Set(messages.map((m) => m.id));
      const fresh = nextMsgs.filter((m) => !known.has(m.id));
      if (fresh.length) {
        await sleep(400);
        setCoachTyping(true);
        await sleep(1400);
        setCoachTyping(false);
        setMessages((list) => [...list, ...fresh]);
      }
    } finally {
      setWarpFrom(null);
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    const res = await fetch("/api/reset", { method: "POST" });
    applyState(await res.json());
    flash("Fresh start. Memory and conversation cleared.");
  }

  /** New chat, same memory: the coach starts fresh but still knows you. */
  async function newConversation() {
    if (busy) return;
    const res = await fetch("/api/session", { method: "POST" });
    applyState(await res.json());
    setInput("");
    inputRef.current?.focus();
  }

  async function sync(sample = false) {
    if (busy || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/sync${sample ? "?sample=1" : ""}`, { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        applyState(json.state);
        flash(sample ? "Loaded sample data" : `Synced ${json.days} days from Google Health`);
      } else {
        flash(`Sync failed: ${json.error}`.slice(0, 140));
      }
    } finally {
      setSyncing(false);
    }
  }


  const pendingCheckin = memories.some((m) => m.status === "checkin");
  const lastId = messages.at(-1)?.id;
  const offset = meta?.simOffsetDays ?? 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full flex-col">
        {/* Top bar: brand + descriptor | data mode + reset + avatar */}
        <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-2.5">
          <TempoMark />
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-[21px] leading-none tracking-tight text-ink">{APP_NAME}</span>
            <span className="text-[11px] text-muted">A fitness coach that remembers you</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-control border border-line px-2 py-1 text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
              {meta?.dataSource === "google_health" ? "Live data" : "Sample data"}
            </span>
            <button onClick={reset} disabled={busy} className="tempo-press text-[12px] text-muted hover:text-ink disabled:opacity-40">
              Reset demo
            </button>
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full bg-sage text-[12px] font-semibold text-surface-strong"
              aria-label={meta ? `Signed in as ${meta.userName}` : undefined}
            >
              {meta?.userName?.[0] ?? ""}
            </div>
          </div>
        </header>

        {/* Memory clock: simulated date | fast-forward */}
        <div className="flex items-center gap-3 border-b border-line bg-surface px-6 py-2">
          <span className="tempo-eyebrow">Memory clock</span>
          <motion.span
            key={meta?.simDate}
            initial={{ opacity: 0.2 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="font-serif text-[15px] text-ink tabular-nums"
          >
            {meta ? longDate(meta.simDate) : ""}
          </motion.span>
          {offset > 0 && (
            <span className="rounded-control bg-amber-soft px-1.5 py-0.5 text-[10px] font-semibold text-amber">
              {offset} days simulated
            </span>
          )}
          <button
            onClick={fastForward}
            disabled={busy || !meta}
            className="tempo-button-primary ml-auto flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] disabled:opacity-40"
          >
            Fast-forward {FAST_FORWARD_DAYS} days <ArrowIcon size={13} />
          </button>
        </div>

        {/* Page heading | health snapshot date, then the health strip */}
        <div className="px-6 pt-4 pb-3">
          <div className="mb-3 flex items-end justify-between">
            <h1 className="tempo-display text-[30px]">{meta ? `${greeting()}, ${meta.userName}.` : " "}</h1>
            <span className="tempo-eyebrow pb-1">
              Health snapshot{meta?.today ? ` · ${shortDate(meta.today.date)}` : ""}
            </span>
          </div>
          {meta && (
            <HealthStrip
              today={meta.today}
              dataSource={meta.dataSource}
              lastSyncAt={meta.lastSyncAt}
              syncing={syncing}
              onSync={() => sync(false)}
              onSample={() => sync(true)}
            />
          )}
        </div>

        {/* Workspace: chat (60%) | memory board (40%) */}
        <main className="flex min-h-0 flex-1 gap-4 px-6">
          <section className="tempo-card flex min-w-0 flex-[3] flex-col overflow-hidden" aria-label="Conversation">
            <div className="flex items-center justify-between border-b border-line px-6 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="tempo-eyebrow">Conversation</span>
                {meta && meta.sessionId > 1 && (
                  <span className="text-[10px] text-muted">
                    #{meta.sessionId} · memory carried over
                  </span>
                )}
              </div>
              <button
                onClick={newConversation}
                disabled={busy || messages.length === 0}
                className="tempo-press flex items-center gap-1.5 rounded-control border border-line bg-surface-strong px-2.5 py-1 text-[11px] font-semibold text-sage hover:border-sage disabled:opacity-40"
                title="Start a fresh chat. Your coach keeps everything it remembers."
              >
                <PlusIcon size={12} /> New conversation
              </button>
            </div>
            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-5" aria-live="polite">
              {messages.length === 0 && meta && (
                <EmptyConversation
                  userName={meta.userName}
                  remembered={memories}
                  busy={busy}
                  onStart={send}
                />
              )}
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  onHoverMemory={setHighlightId}
                  quickReplies={m.kind === "checkin" && m.id === lastId && pendingCheckin && !busy ? CHECKIN_REPLIES : undefined}
                  onQuickReply={send}
                />
              ))}
              <AnimatePresence>
                {coachTyping && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3"
                    role="status"
                    aria-label="Your coach is writing"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-strong">
                      <TempoMark size={18} />
                    </div>
                    <div className="flex gap-1 rounded-card border border-line bg-surface-strong px-4 py-3">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-sage" />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-line bg-surface px-6 pt-3 pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="tempo-eyebrow mr-1 !text-[9px]">Try</span>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      setInput(s.text);
                      inputRef.current?.focus();
                    }}
                    className="tempo-press rounded-control border border-line bg-surface-strong px-2 py-0.5 text-[11px] text-ink-soft hover:border-sage hover:text-ink"
                    title={s.text}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2 rounded-card border border-line bg-surface-strong p-1.5 pl-3 focus-within:border-sage"
              >
                <label htmlFor="coach-input" className="sr-only">
                  Message your coach
                </label>
                <textarea
                  id="coach-input"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={2}
                  placeholder="Tell your coach how you're doing…"
                  className="flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-muted focus-visible:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="tempo-press flex h-9 items-center gap-1.5 rounded-control bg-sage px-3.5 text-[12px] font-semibold text-surface-strong hover:bg-ink disabled:opacity-30"
                >
                  Send <ArrowIcon size={13} />
                </button>
              </form>
            </div>
          </section>

          <aside className="flex min-w-0 flex-[2] flex-col overflow-hidden rounded-panel border border-line bg-surface-muted" aria-label="Memory board">
            <MemoryBoard
              memories={memories}
              history={history}
              glowIds={glowIds}
              learning={learning}
              highlightId={highlightId}
            />
          </aside>
        </main>

        {/* Footer: quiet principle | product signature */}
        <footer className="flex items-center justify-between px-6 py-2.5 text-[10px] text-muted">
          <span>Remembers what matters. Forgets what doesn&apos;t. Asks before it lets go.</span>
          <span>{APP_NAME} · Gemini + Google Health</span>
        </footer>

        <AnimatePresence>{warpFrom && <TimeWarp from={warpFrom} days={FAST_FORWARD_DAYS} />}</AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 rounded-control bg-ink px-4 py-2 text-[12px] text-surface-strong"
              role="status"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function EmptyConversation({
  userName,
  remembered,
  busy,
  onStart,
}: {
  userName: string;
  remembered: MemoryView[];
  busy: boolean;
  onStart: (text: string) => void;
}) {
  const returning = remembered.length > 0;
  const starters = returning ? RETURNING_STARTERS : STARTERS;
  return (
    <div className="mx-auto mt-6 max-w-xl">
      <div className="tempo-eyebrow">{returning ? "New conversation" : "Your coach"}</div>
      <h2 className="tempo-display mt-2 text-[28px]">
        {returning ? `Welcome back, ${userName}.` : "Tell me a little about yourself."}
      </h2>
      {returning ? (
        <>
          <p className="mt-2 text-[13px] leading-[1.8] text-ink-soft">
            Fresh conversation, same coach. I still remember {remembered.length}{" "}
            {remembered.length === 1 ? "thing" : "things"} about you, so there&apos;s no need to repeat yourself.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {remembered.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-[11px] text-ink"
                style={{ background: TIER_META[m.tier].soft }}
              >
                <span style={{ color: TIER_META[m.tier].color }}>
                  <TierIcon tier={m.tier} size={11} />
                </span>
                {m.text}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-[1.8] text-ink-soft">
          I&apos;ll remember what matters for as long as it matters, and I already have today&apos;s snapshot
          from your watch.
        </p>
      )}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {starters.map((s) => (
          <button
            key={s.title}
            onClick={() => onStart(s.text)}
            disabled={busy}
            className="tempo-press rounded-card border border-line bg-surface px-3.5 py-3 text-left hover:border-sage disabled:opacity-40"
          >
            <div className="text-[13px] font-semibold text-ink">{s.title}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted">{s.body}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function longDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function shortDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
