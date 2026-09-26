/**
 * Smoke test for the Gemini wiring: memory builder (structured JSON) + coach (streaming + tools).
 *
 *   npm run gemini:spike
 */
import { buildMemories } from "../lib/memoryBuilder";
import { runCoach } from "../lib/coach";
import { saveMessage } from "../lib/messages";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  db.prepare("DELETE FROM memories").run();
  db.prepare("DELETE FROM messages").run();

  const intro =
    "Training for a half-marathon in November. I'm allergic to peanuts. My knee's been sore since my last long run, and work has been super stressful this week.";
  const m1 = saveMessage({ role: "user", text: intro });
  console.log("\n--- memory builder ---");
  const changes = await buildMemories(intro, null, m1.id);
  for (const c of changes) console.log(c.op, c.memory.tier, c.memory.category ?? "", "|", c.memory.text);
  saveMessage({ role: "coach", text: "Got it, noted all of that." });

  saveMessage({ role: "user", text: "How's my sleep been lately?" });
  console.log("\n--- coach ---");
  const out = await runCoach({
    onText: (d) => process.stdout.write(d),
    onTool: (t) => console.log(`\n[tool] ${t.name} ${JSON.stringify(t.args)} → ${t.label}`),
  });
  console.log("\n\nchips:", out.chips);

  db.prepare("DELETE FROM memories").run();
  db.prepare("DELETE FROM messages").run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
