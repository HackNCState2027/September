import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { generateSampleData } from "./sampleData";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS daily_stats (
  date          TEXT PRIMARY KEY,
  sleep_min     INTEGER,
  deep_min      INTEGER,
  rem_min       INTEGER,
  sleep_start   TEXT,
  sleep_end     TEXT,
  steps         INTEGER,
  resting_hr    REAL,
  hrv_ms        REAL,
  workouts_json TEXT,
  source        TEXT
);

CREATE TABLE IF NOT EXISTS memories (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tier              TEXT NOT NULL,
  category          TEXT,
  text              TEXT NOT NULL,
  status            TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  refreshed_at      TEXT NOT NULL,
  ttl_days          REAL,
  expires_at        TEXT,
  end_date          TEXT,
  needs_checkin     INTEGER DEFAULT 0,
  checkin_sent_at   TEXT,
  pinned            INTEGER DEFAULT 0,
  source_message_id INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  role            TEXT NOT NULL,
  kind            TEXT DEFAULT 'chat',
  text            TEXT NOT NULL,
  chips_json      TEXT,
  tool_calls_json TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);
`;

const globalForDb = globalThis as unknown as { __coachDb?: Database.Database };

function open(): Database.Database {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "app.db"));
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);

  // First run: fill with sample data so the app works before Google Health is set up.
  const count = db.prepare("SELECT COUNT(*) AS n FROM daily_stats").get() as { n: number };
  if (count.n === 0) {
    replaceDailyStats(db, generateSampleData());
    setStateValue(db, "data_source", "sample");
  }
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__coachDb) globalForDb.__coachDb = open();
  return globalForDb.__coachDb;
}

export function getStateValue(key: string, db = getDb()): string | null {
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setStateValue(db: Database.Database, key: string, value: string) {
  db.prepare(
    "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

type DailyRow = {
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
  source: string;
};

export function replaceDailyStats(db: Database.Database, rows: DailyRow[]) {
  const insert = db.prepare(`
    INSERT INTO daily_stats (date, sleep_min, deep_min, rem_min, sleep_start, sleep_end, steps, resting_hr, hrv_ms, workouts_json, source)
    VALUES (@date, @sleep_min, @deep_min, @rem_min, @sleep_start, @sleep_end, @steps, @resting_hr, @hrv_ms, @workouts_json, @source)
  `);
  db.transaction(() => {
    db.prepare("DELETE FROM daily_stats").run();
    for (const r of rows) insert.run(r);
  })();
}
