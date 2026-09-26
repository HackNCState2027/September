export type Tier = "core" | "goal" | "moment";
export type MemoryStatus = "active" | "fading" | "checkin" | "resolved" | "faded";
export type MomentCategory =
  | "injury"
  | "illness"
  | "travel"
  | "stress"
  | "poor_sleep"
  | "fatigue"
  | "other";

export interface Memory {
  id: number;
  tier: Tier;
  category: MomentCategory | null;
  text: string;
  status: MemoryStatus;
  created_at: string;
  refreshed_at: string;
  ttl_days: number | null;
  expires_at: string | null;
  end_date: string | null;
  needs_checkin: number;
  checkin_sent_at: string | null;
  pinned: number;
  source_message_id: number | null;
}

/** Memory as sent to the client, with derived lifespan fields. */
export interface MemoryView extends Memory {
  strength: number; // 0..1, always 1 for core/goal
  days_left: number | null; // null for core/goal
  source_text: string | null; // the message it was learned from, in any conversation
}

export type Chip =
  | { kind: "memory"; id: number; tier: Tier; label: string; daysLeft: number | null }
  | { kind: "data"; label: string };

export interface ChartData {
  metric: string;
  unit: string;
  points: { date: string; value: number | null }[];
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  label: string;
  chart?: ChartData;
}

export interface Persona {
  id: string; // preset id, or "custom"
  name: string;
  tagline: string;
  sample: string; // example line shown in the picker ("" for custom)
  instruction: string; // voice description given to the coach
  custom: boolean;
}

export interface Message {
  id: number;
  role: "user" | "coach";
  kind: "chat" | "checkin" | "persona";
  text: string;
  chips: Chip[];
  tool_calls: ToolCallRecord[];
  created_at: string;
}

export interface DailyStats {
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
  source: "google_health" | "sample";
}

export interface Workout {
  type: string;
  start: string;
  duration_min: number;
  distance_km?: number | null;
  avg_hr?: number | null;
}

export interface TodayMetric {
  key: "sleep" | "hrv" | "resting_hr" | "steps";
  label: string;
  value: string;
  unit: string;
  /** % change vs the previous 7-day average; null when not meaningful. */
  delta: number | null;
  /** Which direction is good for this metric. */
  goodWhen: "up" | "down";
  series: (number | null)[];
}

export interface TodaySnapshot {
  date: string;
  metrics: TodayMetric[];
}

export interface AppState {
  today: TodaySnapshot | null;
  sessionId: number;
  canRewind: boolean;
  persona: Persona;
  personaPresets: Persona[];
  simDate: string;
  simOffsetDays: number;
  userName: string;
  dataSource: "google_health" | "sample" | "none";
  lastSyncAt: string | null;
  latestDataDate: string | null;
  memories: MemoryView[];
  history: MemoryView[];
  messages: Message[];
}

/** Events streamed from POST /api/chat. */
export type ChatEvent =
  | { type: "user"; message: Message }
  | { type: "learning"; active: boolean }
  | { type: "persona"; persona: Persona }
  | { type: "memory"; op: "create" | "refresh" | "resolve" | "update"; memory: MemoryView }
  | { type: "tool"; call: ToolCallRecord }
  | { type: "text"; delta: string }
  | { type: "done"; message: Message }
  | { type: "error"; error: string };
