import { currentSession, getDb, setStateValue } from "@/lib/db";
import { getAppState } from "@/lib/state";

/** Start a new conversation. Memories and health data carry over; the chat starts empty. */
export async function POST() {
  const db = getDb();
  setStateValue(db, "session_id", String(currentSession(db) + 1));
  return Response.json(getAppState());
}
