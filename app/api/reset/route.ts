import { getDb, getStateValue, replaceDailyStats, setStateValue } from "@/lib/db";
import { generateSampleData } from "@/lib/sampleData";
import { getAppState } from "@/lib/state";

export async function POST() {
  const db = getDb();
  db.prepare("DELETE FROM memories").run();
  db.prepare("DELETE FROM messages").run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('memories','messages')").run();
  setStateValue(db, "sim_offset_days", "0");
  setStateValue(db, "session_id", "1");
  // Sample data is regenerated so "today" in the story is always the real today.
  if (getStateValue("data_source", db) !== "google_health") {
    replaceDailyStats(db, generateSampleData());
    setStateValue(db, "data_source", "sample");
  }
  return Response.json(getAppState());
}
