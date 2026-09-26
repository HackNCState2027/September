"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, ChatEvent, MemoryView } from "@/lib/types";
import MemoryBoard from "./MemoryBoard";
import MessageBubble, { type UIMessage } from "./MessageBubble";

const APP_NAME = "Recall Coach";

/** Demo script lines. Clicking one fills the input; the presenter presses Enter. */
const SCRIPT = [
  {
    label: "Intro",
    text: "Training for a half-marathon in November. I'm allergic to peanuts. Knee's been sore since Sunday's long run, and I slept terribly last night.",
  },
  { label: "Advice", text: "What should I do today, and what should I eat after?" },
  { label: "Sleep", text: "How's my sleep been lately?" },
  { label: "Reply", text: "All good now!" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CoachApp() {
  const [meta, setMeta] = useState<Omit<AppState, "memories" | "history" | "messages"> | null>(null);
  const [memories, setMemories] = useState<MemoryView[]>([]);
  const [history, setHistory] = useState<MemoryView[]>([]);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [glowIds, setGlowIds] = useState<Set<number>>(new Set());
  const [coachTyping, setCoachTyping] = useState(false);
  const [learning, setLearning] = useState(false);
  const [busy, setBusy] = useState(false);
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
    setTimeout(() => setGlowIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    }), 2600);
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
            patchCoach((m) => ({ ...m, streaming: false, text: `⚠️ ${ev.error}` }));
          }
        }
      }
    } catch (err) {
      patchCoach((m) => ({ ...m, streaming: false, text: `⚠️ ${String(err)}` }));
    } finally {
      setBusy(false);
      setLearning(false);
      inputRef.current?.focus();
    }
  }

  /** The showpiece: move the sim clock, then play memory transitions one at a time. */
  async function fastForward() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      const { state } = (await res.json()) as { state: AppState };
      const { memories: nextMem, history: nextHist, messages: nextMsgs, ...rest } = state;
      setMeta(rest);
      await sleep(500);

      // Update lifespans first (rings drain), then remove what faded, one by one.
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
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    const res = await fetch("/api/reset", { method: "POST" });
    applyState(await res.json());
    flash("Demo reset");
  }

  async function sync(sample = false) {
    if (busy) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  const simLabel = meta
    ? new Date(meta.simDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "";

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-line bg-panel px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm text-white">C</div>
          <div>
            <div className="text-[15px] font-semibold leading-tight tracking-tight">{APP_NAME}</div>
            <div className="text-[11px] leading-tight text-muted">Remembers what matters. Forgets what doesn&apos;t.</div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {meta && (
            <button
              onClick={() => sync(false)}
              onDoubleClick={() => sync(true)}
              title="Click: sync Google Health · Double-click: load sample data"
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs hover:bg-bg"
            >
              {meta.dataSource === "google_health" ? "📡 Google Health" : "🧪 Sample data"}
              <span className="text-muted">
                {meta.lastSyncAt ? `· synced ${timeAgo(meta.lastSyncAt)}` : "· sync"}
              </span>
            </button>
          )}

          <motion.div
            key={meta?.simDate}
            initial={{ scale: 1.25, backgroundColor: "var(--warn-soft)" }}
            animate={{ scale: 1, backgroundColor: meta?.simOffsetDays ? "var(--warn-soft)" : "var(--bg)" }}
            transition={{ duration: 0.6 }}
            className="rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums"
          >
            📅 {simLabel}
            {meta?.simOffsetDays ? <span className="ml-1 text-warn">+{meta.simOffsetDays}d</span> : null}
          </motion.div>

          <button
            onClick={fastForward}
            disabled={busy}
            className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            ⏩ +7 days
          </button>
          <button onClick={reset} disabled={busy} className="rounded-full px-3 py-1.5 text-xs text-muted hover:text-ink">
            Reset
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {/* Chat */}
        <section className="flex min-w-0 flex-[3] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-8 py-6">
            {messages.length === 0 && (
              <div className="mx-auto mt-16 max-w-md text-center">
                <div className="text-3xl">👋</div>
                <div className="mt-3 text-lg font-semibold">Hey {meta?.userName ?? ""}, I&apos;m your coach.</div>
                <p className="mt-1 text-sm text-muted">
                  Tell me about yourself and I&apos;ll remember what matters, for as long as it matters.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
            <AnimatePresence>
              {coachTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm text-white">C</div>
                  <div className="flex gap-1 rounded-2xl border border-line bg-panel px-4 py-3">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-line bg-panel px-8 pt-3 pb-4">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SCRIPT.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setInput(s.text);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted hover:border-ink hover:text-ink"
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
              className="flex items-end gap-2"
            >
              <textarea
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
                placeholder="Talk to your coach…"
                className="flex-1 resize-none rounded-xl border border-line bg-bg px-4 py-2.5 text-[15px] outline-none focus:border-ink"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-30"
              >
                Send
              </button>
            </form>
          </div>
        </section>

        {/* Memory board */}
        <aside className="flex w-[400px] shrink-0 flex-col border-l border-line bg-bg">
          <MemoryBoard memories={memories} history={history} glowIds={glowIds} learning={learning} />
        </aside>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

