import { GoogleGenAI } from "@google/genai";

export const COACH_MODEL = process.env.COACH_MODEL || "gemini-3.8-flash";
export const MEMORY_MODEL = process.env.MEMORY_MODEL || "gemini-3.8-flash";

const globalForAi = globalThis as unknown as { __genai?: GoogleGenAI };

export function ai(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in .env.local");
  if (!globalForAi.__genai) globalForAi.__genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return globalForAi.__genai;
}

/** One-shot text generation (used for check-ins). */
export async function generateText(opts: { model?: string; system?: string; input: string }): Promise<string> {
  const interaction = await ai().interactions.create({
    model: opts.model ?? COACH_MODEL,
    system_instruction: opts.system,
    input: opts.input,
    generation_config: { thinking_level: "low" },
  });
  return (interaction.output_text ?? "").trim();
}

/** One-shot structured JSON generation (used by the memory builder). */
export async function generateJson<T>(opts: {
  model?: string;
  system: string;
  input: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const interaction = await ai().interactions.create({
    model: opts.model ?? MEMORY_MODEL,
    system_instruction: opts.system,
    input: opts.input,
    generation_config: { thinking_level: "low" },
    response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
  });
  return JSON.parse(interaction.output_text ?? "{}") as T;
}
