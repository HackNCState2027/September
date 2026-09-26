import { getDb, getStateValue } from "./db";
import { localDate, simNow, simOffsetDays } from "./clock";
import { liveMemories, resolvedMemories, toView } from "./memoryEngine";
import { allMessages } from "./messages";
import { latestDate, todaySnapshot } from "./tools";
import { userName } from "./coach";
import type { AppState } from "./types";

export function getAppState(): AppState {
  const db = getDb();
  const now = simNow();
  return {
    today: todaySnapshot(),
    simDate: localDate(now),
    simOffsetDays: simOffsetDays(),
    userName: userName(),
    dataSource: (getStateValue("data_source", db) as AppState["dataSource"]) ?? "none",
    lastSyncAt: getStateValue("last_sync_at", db),
    latestDataDate: latestDate(),
    memories: liveMemories().map((m) => toView(m, now)),
    history: resolvedMemories().map((m) => toView(m, now)),
    messages: allMessages(),
  };
}
