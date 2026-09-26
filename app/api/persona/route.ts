import { customPersona, personaIntro, PRESETS, setPersona } from "@/lib/persona";
import { saveMessage } from "@/lib/messages";
import { getAppState } from "@/lib/state";

/** POST { id: "funny" } picks a preset; POST { custom: "talk like a pirate" } builds one.
 *  The coach then introduces its new voice in character. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: string; custom?: string };
  try {
    const persona = body.custom?.trim()
      ? await customPersona(body.custom.trim().slice(0, 300))
      : PRESETS.find((p) => p.id === body.id);
    if (!persona) return Response.json({ error: "Unknown persona" }, { status: 400 });
    setPersona(persona);
    const intro = await personaIntro(persona);
    const message = saveMessage({ role: "coach", kind: "persona", text: intro });
    return Response.json({ state: getAppState(), messageId: message.id });
  } catch (err) {
    console.error("persona change failed", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
