/**
 * Google Health API v4 sync (Fitbit / Pixel Watch). Field names verified against real
 * responses (Fitbit Air, Sept 2026). Re-check with `npm run google:dump` if something looks off.
 *
 * Note: this API only has data from Fitbit / Pixel devices (and manual entries). Older
 * phone-only Google Fit history is not available here.
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

// ---- response shapes (only the fields we use) ----------------------------------------

type CivilDate = { year: number; month: number; day: number };
type Interval = { startTime: string; endTime: string };

type SleepPoint = {
  sleep: {
    interval: Interval;
    metadata?: { mainSleep?: boolean };
    summary?: { minutesAsleep?: string; stagesSummary?: { type: string; minutes: string }[] };
  };
};
type RhrPoint = { dailyRestingHeartRate: { date: CivilDate; beatsPerMinute: string } };
type HrvPoint = {
  heartRateVariability: { sampleTime: { physicalTime: string }; rootMeanSquareOfSuccessiveDifferencesMilliseconds: number };
};
type ExercisePoint = {
  exercise: {
    interval: Interval;
    exerciseType?: string;
    displayName?: string;
    activeDuration?: string;
    metricsSummary?: Record<string, unknown>;
  };
};
type StepsRollup = { civilStartTime: { date: CivilDate }; steps?: { countSum?: string } };

/** Lists data points for a type, following pagination. `stopWhen` ends paging early. */
export async function listPoints<T>(
  token: string,
  type: string,
  filter: string | null,
  opts: { maxPages?: number; stopWhen?: (page: T[]) => boolean } = {},
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL(`${BASE}/${type}/dataPoints`);
    if (filter) url.searchParams.set("filter", filter);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(`${type}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
    const page = (json.dataPoints ?? []) as T[];
    out.push(...page);
    pageToken = json.nextPageToken;
    pages++;
    if (opts.stopWhen?.(page) || (opts.maxPages && pages >= opts.maxPages)) break;
  } while (pageToken);
  return out;
}

async function dailyStepTotals(token: string, from: string, toExclusive: string): Promise<StepsRollup[]> {
  const toCivil = (d: string) => {
    const [year, month, day] = d.split("-").map(Number);
    return { date: { year, month, day } };
  };
  const res = await fetch(`${BASE}/steps/dataPoints:dailyRollUp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range: { start: toCivil(from), end: toCivil(toExclusive) } }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`steps rollup: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return (json.rollupDataPoints ?? []) as StepsRollup[];
}

export function filtersFor(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceIso = since.toISOString();
  return {
    sleep: `sleep.interval.end_time >= "${sinceIso}"`,
    steps: `steps.interval.start_time >= "${sinceIso}"`,
    "daily-resting-heart-rate": `daily_resting_heart_rate.date >= "${localDate(since)}"`,
    "heart-rate-variability": `heart_rate_variability.sample_time.physical_time >= "${sinceIso}"`,
    exercise: null, // the API rejects every interval filter on exercise; we filter by date locally
  } as const;
}

const civil = (d: CivilDate) =>
  `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
const seconds = (s?: string) => (s ? parseFloat(s) : 0);

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
  const today = localDate(new Date());
  const firstDay = addDays(today, -(days - 1));
  const cutoff = new Date(Date.now() - days * 86_400_000);

  const [sleep, steps, rhr, hrv, exercise] = await Promise.all([
    listPoints<SleepPoint>(token, "sleep", f.sleep),
    dailyStepTotals(token, firstDay, addDays(today, 1)),
    listPoints<RhrPoint>(token, "daily-resting-heart-rate", f["daily-resting-heart-rate"]),
    listPoints<HrvPoint>(token, "heart-rate-variability", f["heart-rate-variability"]),
    listPoints<ExercisePoint>(token, "exercise", null, {
      maxPages: 5,
      stopWhen: (page) => page.some((p) => new Date(p.exercise.interval.startTime) < cutoff),
    }),
  ]);

  const byDate = new Map<string, SyncedDay>();
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    byDate.set(date, {
      date, sleep_min: null, deep_min: null, rem_min: null, sleep_start: null, sleep_end: null,
      steps: null, resting_hr: null, hrv_ms: null, workouts_json: "[]", source: "google_health",
    });
  }

  // Sleep: main sleep only, attributed to the local wake-up date.
  const mainSleeps = sleep.filter((p) => p.sleep.metadata?.mainSleep !== false);
  for (const p of mainSleeps) {
    const start = new Date(p.sleep.interval.startTime);
    const end = new Date(p.sleep.interval.endTime);
    const day = byDate.get(localDate(end));
    if (!day) continue;
    const stage = (t: string) =>
      Number(p.sleep.summary?.stagesSummary?.find((s) => s.type === t)?.minutes ?? 0) || null;
    const asleep = Number(p.sleep.summary?.minutesAsleep ?? 0) || Math.round((end.getTime() - start.getTime()) / 60_000);
    day.sleep_min = (day.sleep_min ?? 0) + asleep;
    day.deep_min = stage("DEEP");
    day.rem_min = stage("REM");
    day.sleep_start = start.toISOString();
    day.sleep_end = end.toISOString();
  }

  for (const p of steps) {
    const day = byDate.get(civil(p.civilStartTime.date));
    if (day && p.steps?.countSum != null) day.steps = Number(p.steps.countSum);
  }

  for (const p of rhr) {
    const day = byDate.get(civil(p.dailyRestingHeartRate.date));
    if (day) day.resting_hr = Number(p.dailyRestingHeartRate.beatsPerMinute);
  }

  // HRV: Fitbit samples it during sleep. Average each night's samples onto the wake-up date.
  const nights = mainSleeps.map((p) => ({
    start: new Date(p.sleep.interval.startTime).getTime(),
    end: new Date(p.sleep.interval.endTime).getTime(),
    date: localDate(new Date(p.sleep.interval.endTime)),
  }));
  const hrvAcc = new Map<string, number[]>();
  for (const p of hrv) {
    const t = new Date(p.heartRateVariability.sampleTime.physicalTime).getTime();
    const ms = p.heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds;
    if (ms == null) continue;
    const date = nights.find((n) => t >= n.start && t <= n.end)?.date ?? localDate(new Date(t));
    hrvAcc.set(date, [...(hrvAcc.get(date) ?? []), ms]);
  }
  for (const [date, values] of hrvAcc) {
    const day = byDate.get(date);
    if (day) day.hrv_ms = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  // Workouts.
  const workouts = new Map<string, Workout[]>();
  for (const p of exercise) {
    const e = p.exercise;
    const start = new Date(e.interval.startTime);
    const end = new Date(e.interval.endTime);
    const m = e.metricsSummary ?? {};
    const distanceKey = Object.keys(m).find((k) => k.toLowerCase().includes("distance"));
    const distanceRaw = distanceKey ? Number(m[distanceKey]) : null;
    const w: Workout = {
      type: (e.displayName || e.exerciseType || "workout").toLowerCase(),
      start: start.toISOString(),
      duration_min: Math.round((seconds(e.activeDuration) || (end.getTime() - start.getTime()) / 1000) / 60),
      distance_km:
        distanceRaw == null ? null
        : distanceKey!.toLowerCase().includes("millimeter") ? Math.round(distanceRaw / 1e5) / 10
        : distanceKey!.toLowerCase().includes("meter") ? Math.round(distanceRaw / 100) / 10
        : distanceRaw,
      avg_hr: m.averageHeartRateBeatsPerMinute != null ? Number(m.averageHeartRateBeatsPerMinute) : null,
    };
    const key = localDate(start);
    if (!byDate.has(key)) continue;
    workouts.set(key, [...(workouts.get(key) ?? []), w]);
  }
  for (const [date, list] of workouts) byDate.get(date)!.workouts_json = JSON.stringify(list);

  return [...byDate.values()];
}
