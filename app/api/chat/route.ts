import { runCoach } from "@/lib/coach";
import { runTick } from "@/lib/checkin";
import { buildMemories } from "@/lib/memoryBuilder";
import { setPersona } from "@/lib/persona";
import { recentMessages, saveMessage } from "@/lib/messages";
import type { ChatEvent } from "@/lib/types";

export async function POST(request: Request) {
  const { text } = (await request.json()) as { text: string };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        await runTick();
        const previousCoach = recentMessages(1).find((m) => m.role === "coach")?.text ?? null;
        const userMsg = saveMessage({ role: "user", text });
        send({ type: "user", message: userMsg });

        // Learn first, then answer: the board fills visibly, and the coach can cite what it just learned.
        send({ type: "learning", active: true });
        try {
          const { changes, persona } = await buildMemories(text, previousCoach, userMsg.id);
          changes.forEach((c) => send({ type: "memory", op: c.op, memory: c.memory }));
          // "Be funnier" in plain chat switches the persona; this very reply uses the new voice.
          if (persona) {
            const p = { id: "custom", name: persona.name, tagline: persona.style, sample: "", instruction: persona.style, custom: true };
            setPersona(p);
            send({ type: "persona", persona: p });
          }
        } catch (err) {
          console.error("memory builder failed", err);
        }
        send({ type: "learning", active: false });

        const out = await runCoach({
          onText: (delta) => send({ type: "text", delta }),
          onTool: (call) => send({ type: "tool", call }),
        });
        const coachMsg = saveMessage({ role: "coach", text: out.text, chips: out.chips, toolCalls: out.toolCalls });
        send({ type: "done", message: coachMsg });
      } catch (err) {
        console.error("chat failed", err);
        send({ type: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
