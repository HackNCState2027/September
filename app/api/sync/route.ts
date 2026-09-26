import { getDb, replaceDailyStats, setStateValue } from "@/lib/db";
import { syncGoogleHealth } from "@/lib/googleHealth";
import { generateSampleData } from "@/lib/sampleData";
import { getAppState } from "@/lib/state";

/** POST /api/sync            → pull the last 30 days from Google Health
 *  POST /api/sync?sample=1   → load generated sample data instead */
export async function POST(request: Request) {
  const db = getDb();
  const useSample = new URL(request.url).searchParams.get("sample") === "1";
  try {
    const rows = useSample ? generateSampleData() : await syncGoogleHealth(30);
    replaceDailyStats(db, rows);
    setStateValue(db, "data_source", useSample ? "sample" : "google_health");
    setStateValue(db, "last_sync_at", new Date().toISOString());
    return Response.json({ ok: true, days: rows.length, state: getAppState() });
  } catch (err) {
    console.error("sync failed", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
