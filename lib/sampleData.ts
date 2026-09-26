import type { Workout } from "./types";

/**
 * 30 days of believable data that tells the demo story:
 * - baseline ~7h sleep, HRV ~60 ms, resting HR ~54, runs 3x/week
 * - a long run (~18 km) on the most recent Sunday
 * - a bad last night (~4h50, little deep sleep) and an HRV dip today (~14% under baseline)
 * - sleep drifting down over the last 7 days
 */
export function generateSampleData(today = new Date()) {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const jitter = (base: number, spread: number) => base + (rand() * 2 - 1) * spread;

  const days = 30;
  const rows = [];
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Most recent Sunday strictly before today (if today is Sunday, last week's).
  const daysSinceSunday = todayMid.getDay() === 0 ? 7 : todayMid.getDay();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayMid);
    d.setDate(d.getDate() - i);
    const date = fmt(d);
    const isToday = i === 0;
    const isLongRunDay = i === daysSinceSunday;
    const inLastWeek = i < 7;

    // Sleep drifts down ~6 min/day over the last week; last night is terrible.
    let sleep = jitter(425, 25) - (inLastWeek ? (7 - i) * 6 : 0);
    let deep = jitter(80, 12) - (inLastWeek ? (7 - i) * 2 : 0);
    if (isToday) {
      sleep = 290;
      deep = 38;
    }
    const rem = sleep * 0.22;

    let hrv = jitter(60, 5);
    let rhr = jitter(54, 2);
    if (i === daysSinceSunday - 1) hrv -= 6; // day after long run
    if (isToday) {
      hrv = 52;
      rhr = 57;
    }

    const workouts: Workout[] = [];
    const dow = d.getDay();
    if (isLongRunDay) {
      workouts.push(run(d, 7, 102, 18.2, 152));
    } else if (i < daysSinceSunday) {
      // Resting since the long run (sore knee).
    } else if (dow === 2 || dow === 4) {
      workouts.push(run(d, 7, Math.round(jitter(42, 6)), round1(jitter(7.5, 1.2)), Math.round(jitter(148, 4))));
    } else if (dow === 6) {
      workouts.push({ type: "strength", start: iso(d, 18), duration_min: 45, distance_km: null, avg_hr: 118 });
    }

    let steps = jitter(9000, 1500);
    if (isLongRunDay) steps = 26500;
    if (isToday) steps = 3100;

    const wake = new Date(d);
    wake.setHours(6, 45, 0, 0);
    const bed = new Date(wake.getTime() - sleep * 60_000 - 20 * 60_000);

    rows.push({
      date,
      sleep_min: Math.round(sleep),
      deep_min: Math.round(deep),
      rem_min: Math.round(rem),
      sleep_start: bed.toISOString(),
      sleep_end: wake.toISOString(),
      steps: Math.round(steps),
      resting_hr: round1(rhr),
      hrv_ms: round1(hrv),
      workouts_json: JSON.stringify(workouts),
      source: "sample",
    });
  }
  return rows;
}

function run(d: Date, hour: number, minutes: number, km: number, hr: number): Workout {
  return { type: "run", start: iso(d, hour), duration_min: minutes, distance_km: km, avg_hr: hr };
}

function iso(d: Date, hour: number) {
  const x = new Date(d);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
