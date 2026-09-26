/**
 * Google Health API v4 sync (Fitbit / Pixel Watch).
 *
 * ⚠️ Field names below are best guesses from public docs. Before relying on this, run
 *   npx tsx scripts/gh-dump.ts
 * and adjust the extractors against the raw JSON saved in data/raw/.
 */
import { addDays, localDate } from "./clock";
import type { Workout } from "./types";

const BASE = "https://health.googleapis.com/v4/users/me/dataTypes";

export const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
];

export async function accessToken(): Promise<string> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REFRESH_TOKEN)
    throw new Error("Google Health is not configured (GOOGLE_CLIENT_ID / GOOGLE_REFRESH_TOKEN missing)");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

type Point = Record<string, unknown>;

/** Lists all data points for a type, following pagination. */
export async function listPoints(token: string, type: string, filter: string): Promise<Point[]> {
  const out: Point[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${BASE}/${type}/dataPoints`);
    url.searchParams.set("filter", filter);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(`${type}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
    out.push(...((json.dataPoints ?? []) as Point[]));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

export function filtersFor(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceIso = since.toISOString();
  const sinceDate = localDate(since);
  return {
    sleep: `sleep.interval.end_time >= "${sinceIso}"`,
    steps: `steps.interval.start_time >= "${sinceIso}"`,
    "daily-resting-heart-rate": `daily_resting_heart_rate.date >= "${sinceDate}"`,
    "heart-rate-variability": `heart_rate_variability.sample_time.physical_time >= "${sinceIso}"`,
    exercise: `exercise.interval.end_time >= "${sinceIso}"`,
  } as const;
}

// ---- tolerant extractors -------------------------------------------------------------

/** Find the first value for any of the keys, searching nested objects. */
function find(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) if (k in (obj as Point)) return (obj as Point)[k];
  for (const v of Object.values(obj as Point)) {
    const hit = find(v, keys);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const toDate = (v: unknown) => (typeof v === "string" ? new Date(v) : null);
const toNum = (v: unknown) => (v == null ? null : Number(v));

function interval(p: Point) {
  const start = toDate(find(p, ["startTime", "start_time", "physicalTime"]));
  const end = toDate(find(p, ["endTime", "end_time"]));
  return { start, end };
}

function dateOf(v: unknown): string | null {
  if (typeof v === "string") return v.slice(0, 10);
  if (v && typeof v === "object" && "year" in v) {
    const d = v as { year: number; month: number; day: number };
    return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  }
  return null;
}

export interface SyncedDay {
  date: string;
  sleep_min: number | null;
  deep_min: number | null;
  rem_min: number | null;
  sleep_start: string | null;
  sleep_end: string | null;
  steps: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  workouts_json: string | null;
  source: "google_health";
}

export async function syncGoogleHealth(days = 30): Promise<SyncedDay[]> {
  const token = await accessToken();
  const f = filtersFor(days);
  const [sleep, steps, rhr, hrv, exercise] = await Promise.all([
    listPoints(token, "sleep", f.sleep),
    listPoints(token, "steps", f.steps),
    listPoints(token, "daily-resting-heart-rate", f["daily-resting-heart-rate"]),
    listPoints(token, "heart-rate-variability", f["heart-rate-variability"]).catch(() => [] as Point[]),
    listPoints(token, "exercise", f.exercise).catch(() => [] as Point[]),
  ]);

  const byDate = new Map<string, SyncedDay>();
  const today = localDate(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    byDate.set(date, {
      date, sleep_min: null, deep_min: null, rem_min: null, sleep_start: null, sleep_end: null,
      steps: null, resting_hr: null, hrv_ms: null, workouts_json: "[]", source: "google_health",
    });
  }

  // Sleep sessions → attributed to the wake-up date.
  for (const p of sleep) {
    const { start, end } = interval(p);
    if (!start || !end) continue;
    const day = byDate.get(localDate(end));
    if (!day) continue;
    const minutes = (end.getTime() - start.getTime()) / 60_000;
    const asleep = toNum(find(p, ["minutesAsleep", "asleepMinutes"])) ?? minutes;
    day.sleep_min = Math.round((day.sleep_min ?? 0) + asleep);
    day.sleep_start ??= start.toISOString();
    day.sleep_end = end.toISOString();
    const stages = find(p, ["stages", "levels"]);
    if (Array.isArray(stages)) {
      for (const s of stages as Point[]) {
        const kind = String(find(s, ["type", "stage", "level"]) ?? "").toLowerCase();
        const iv = interval(s);
        const mins = iv.start && iv.end ? (iv.end.getTime() - iv.start.getTime()) / 60_000 : toNum(find(s, ["minutes"])) ?? 0;
        if (kind.includes("deep")) day.deep_min = Math.round((day.deep_min ?? 0) + mins);
        if (kind.includes("rem")) day.rem_min = Math.round((day.rem_min ?? 0) + mins);
      }
    }
  }

  // Steps intervals → summed per local day.
  for (const p of steps) {
    const { start } = interval(p);
    const day = start && byDate.get(localDate(start));
    const count = toNum(find(p, ["count", "steps", "value"]));
    if (day && count != null) day.steps = (day.steps ?? 0) + count;
  }

  for (const p of rhr) {
    const day = byDate.get(dateOf(find(p, ["date"])) ?? "");
    const bpm = toNum(find(p, ["beatsPerMinute", "bpm", "value"]));
    if (day && bpm != null) day.resting_hr = bpm;
  }

  // HRV samples → daily average.
  const hrvAcc = new Map<string, number[]>();
  for (const p of hrv) {
    const t = toDate(find(p, ["physicalTime", "startTime"]));
    const ms = toNum(find(p, ["rmssdMillis", "rmssd", "milliseconds", "value"]));
    if (!t || ms == null) continue;
    const key = localDate(t);
    hrvAcc.set(key, [...(hrvAcc.get(key) ?? []), ms]);
  }
  for (const [date, values] of hrvAcc) {
    const day = byDate.get(date);
    if (day) day.hrv_ms = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  // Exercise sessions.
  const workouts = new Map<string, Workout[]>();
  for (const p of exercise) {
    const { start, end } = interval(p);
    if (!start) continue;
    const w: Workout = {
      type: String(find(p, ["exerciseType", "activityName", "type"]) ?? "workout").toLowerCase(),
      start: start.toISOString(),
      duration_min: end ? Math.round((end.getTime() - start.getTime()) / 60_000) : 0,
      distance_km: (() => {
        const m = toNum(find(p, ["distanceMeters", "distance"]));
        return m != null ? Math.round((m > 1000 ? m / 1000 : m) * 10) / 10 : null;
      })(),
      avg_hr: toNum(find(p, ["averageHeartRate", "averageHeartRateBpm", "avgHeartRate"])),
    };
    const key = localDate(start);
    workouts.set(key, [...(workouts.get(key) ?? []), w]);
  }
  for (const [date, list] of workouts) {
    const day = byDate.get(date);
    if (day) day.workouts_json = JSON.stringify(list);
  }

  return [...byDate.values()];
}
