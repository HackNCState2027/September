import { getDb, getStateValue } from "./db";

export const DAY_MS = 86_400_000;

export function simOffsetDays(): number {
  return Number(getStateValue("sim_offset_days", getDb()) ?? "0");
}

/** "Now" for memories and messages. Health data always uses real dates. */
export function simNow(): Date {
  return new Date(Date.now() + simOffsetDays() * DAY_MS);
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + days));
}
