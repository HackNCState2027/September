import { runCoach } from "@/lib/coach";
import { runTick } from "@/lib/checkin";
import { buildMemories } from "@/lib/memoryBuilder";
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

        // Memory builder and coach run in parallel, so cards appear while the reply streams.
        const memoryTask = buildMemories(text, previousCoach, userMsg.id)
          .then((changes) => changes.forEach((c) => send({ type: "memory", op: c.op, memory: c.memory })))
          .catch((err) => console.error("memory builder failed", err));

        const coachTask = runCoach({
          onText: (delta) => send({ type: "text", delta }),
          onTool: (call) => send({ type: "tool", call }),
        }).then((out) => {
          const msg = saveMessage({ role: "coach", text: out.text, chips: out.chips, toolCalls: out.toolCalls });
          return msg;
        });

        const [, coachMsg] = await Promise.all([memoryTask, coachTask]);
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
