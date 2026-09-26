import { generateText } from "./gemini";
import { saveMessage } from "./messages";
import { tick } from "./memoryEngine";
import { userName } from "./coach";
import type { Memory, Message } from "./types";

/** Advance memory statuses; if any high-stakes memory is about to go, the coach asks first. */
export async function runTick(): Promise<Message | null> {
  const due = tick();
  if (due.length === 0) return null;
  return saveMessage({ role: "coach", kind: "checkin", text: await checkinText(due) });
}

async function checkinText(memories: Memory[]): Promise<string> {
  const name = userName();
  const list = memories.map((m) => `- ${m.text}`).join("\n");
  try {
    const text = await generateText({
      system: `You are ${name}'s fitness coach sending a short, friendly check-in message on your own initiative. 1-2 sentences, casual, like a text from a coach who cares. Ask whether the items below still apply and offer to stop planning around them if not. No greeting longer than "Hey ${name}".`,
      input: `Things you've been planning around for a while:\n${list}`,
    });
    if (text) return text;
  } catch (err) {
    console.error("check-in generation failed, using template", err);
  }
  const what = memories.map((m) => `"${m.text}"`).join(" and ");
  return `Hey ${name}, quick check-in: is ${what} still a thing? If not, I'll stop planning around it.`;
}
