import { getDb } from "./db";
import type { ChartData, DailyStats, Workout } from "./types";

const METRICS = {
  sleep: { column: "sleep_min", label: "sleep", unit: "h", toDisplay: (v: number) => round1(v / 60) },
  deep_sleep: { column: "deep_min", label: "deep sleep", unit: "min", toDisplay: (v: number) => Math.round(v) },
  hrv: { column: "hrv_ms", label: "HRV", unit: "ms", toDisplay: (v: number) => round1(v) },
  resting_hr: { column: "resting_hr", label: "resting HR", unit: "bpm", toDisplay: (v: number) => round1(v) },
  steps: { column: "steps", label: "steps", unit: "steps", toDisplay: (v: number) => Math.round(v) },
} as const;

type MetricKey = keyof typeof METRICS | "workouts";

/** Tool declarations in Interactions API format. */
export const TOOL_DECLARATIONS = [
  {
    type: "function" as const,
    name: "get_day",
    description:
      "Get the user's health data for one specific day: sleep (minutes, deep, REM), steps, resting heart rate, HRV, workouts.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "Date as YYYY-MM-DD" } },
      required: ["date"],
    },
  },
  {
    type: "function" as const,
    name: "get_range",
    description:
      "Get daily values plus average/min/max for one or more metrics over the last N days (ending on the latest synced day). Use this for any question about trends, 'lately', 'this week', or comparisons.",
    parameters: {
      type: "object",
      properties: {
        metrics: {
          type: "array",
          items: { type: "string", enum: ["sleep", "deep_sleep", "hrv", "resting_hr", "steps", "workouts"] },
        },
        days: { type: "integer", enum: [7, 14, 30] },
      },
      required: ["metrics", "days"],
    },
  },
];

export function latestDate(): string | null {
  const row = getDb().prepare("SELECT MAX(date) AS d FROM daily_stats").get() as { d: string | null };
  return row.d;
}

function lastNDays(n: number): DailyStats[] {
  return (
    getDb().prepare("SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?").all(n) as DailyStats[]
  ).reverse();
}

export function getDay(date: string): DailyStats | null {
  return (getDb().prepare("SELECT * FROM daily_stats WHERE date = ?").get(date) as DailyStats) ?? null;
}

export function formatDay(row: DailyStats) {
  return {
    date: row.date,
    sleep: row.sleep_min != null ? fmtDuration(row.sleep_min) : null,
    deep_sleep_min: row.deep_min,
    rem_min: row.rem_min,
    steps: row.steps,
    resting_hr_bpm: row.resting_hr,
    hrv_ms: row.hrv_ms,
    workouts: parseWorkouts(row.workouts_json),
  };
}

export interface ToolResult {
  result: unknown;
  label: string;
  chart?: ChartData;
}

export function runTool(name: string, args: Record<string, unknown>): ToolResult {
  if (name === "get_day") {
    const date = String(args.date ?? "");
    const row = getDay(date);
    return {
      result: row ? formatDay(row) : { error: `No data for ${date}` },
      label: `${date}`,
    };
  }

  if (name === "get_range") {
    const days = [7, 14, 30].includes(Number(args.days)) ? Number(args.days) : 7;
    const metrics = (Array.isArray(args.metrics) ? args.metrics : ["sleep"]) as MetricKey[];
    const rows = lastNDays(days);
    const result: Record<string, unknown> = { days, from: rows[0]?.date, to: rows.at(-1)?.date };
    let chart: ChartData | undefined;

    for (const key of metrics) {
      if (key === "workouts") {
        result.workouts = rows.flatMap((r) => parseWorkouts(r.workouts_json).map((w) => ({ date: r.date, ...w })));
        continue;
      }
      const spec = METRICS[key];
      if (!spec) continue;
      const values = rows.map((r) => (r as unknown as Record<string, number | null>)[spec.column]);
      const present = values.filter((v): v is number => v != null);
      const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
      result[key] = {
        unit: spec.unit,
        average: avg != null ? spec.toDisplay(avg) : null,
        min: present.length ? spec.toDisplay(Math.min(...present)) : null,
        max: present.length ? spec.toDisplay(Math.max(...present)) : null,
        daily: rows.map((r, i) => ({ date: r.date, value: values[i] != null ? spec.toDisplay(values[i]!) : null })),
      };
      chart ??= {
        metric: spec.label,
        unit: spec.unit,
        points: rows.map((r, i) => ({ date: r.date, value: values[i] != null ? spec.toDisplay(values[i]!) : null })),
      };
    }

    const names = metrics.map((m) => (m === "workouts" ? "workouts" : METRICS[m]?.label ?? m));
    return { result, label: `${names.join(" + ")} · last ${days} days`, chart };
  }

  return { result: { error: `Unknown tool ${name}` }, label: name };
}

/** Short-term context for the system prompt: latest day + 7-day baseline. */
export function todaySummary(): string {
  const rows = lastNDays(8);
  const today = rows.at(-1);
  if (!today) return "No health data synced.";
  const prior = rows.slice(0, -1);
  const avg = (col: keyof DailyStats) => {
    const v = prior.map((r) => r[col] as number | null).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const parts: string[] = [];
  if (today.sleep_min != null)
    parts.push(`sleep last night ${fmtDuration(today.sleep_min)}${today.deep_min != null ? ` (deep ${today.deep_min}m)` : ""} vs 7-day avg ${fmtDuration(avg("sleep_min") ?? 0)}`);
  if (today.hrv_ms != null) parts.push(`HRV ${today.hrv_ms} ms (7-day avg ${round1(avg("hrv_ms") ?? 0)})`);
  if (today.resting_hr != null) parts.push(`resting HR ${today.resting_hr} bpm (7-day avg ${round1(avg("resting_hr") ?? 0)})`);
  if (today.steps != null) parts.push(`steps so far ${today.steps.toLocaleString("en-US")}`);

  const recent = rows
    .slice(-7)
    .flatMap((r) => parseWorkouts(r.workouts_json).map((w) => ({ date: r.date, ...w })));
  parts.push(
    recent.length
      ? `workouts in the last 7 days: ${recent
          .map((w) => `${weekday(w.date)} ${w.date} ${w.type}${w.distance_km ? ` ${w.distance_km} km` : ""} (${w.duration_min} min)`)
          .join("; ")}`
      : "no workouts in the last 7 days",
  );

  return `Latest synced day: ${today.date} (${weekday(today.date)})\n` + parts.map((p) => `- ${p}`).join("\n");
}

function parseWorkouts(json: string | null): Workout[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Workout[];
  } catch {
    return [];
  }
}

function fmtDuration(min: number) {
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}m`;
}

function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
