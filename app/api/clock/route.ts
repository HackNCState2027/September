import { getDb, setStateValue } from "@/lib/db";
import { simOffsetDays } from "@/lib/clock";
import { runTick } from "@/lib/checkin";
import { getAppState } from "@/lib/state";
import { rewind, saveSnapshot } from "@/lib/timeTravel";

/** POST { days: 7 } fast-forwards the memory clock; { days: -7 } undoes the last fast-forward. */
export async function POST(request: Request) {
  const { days = 7 } = (await request.json().catch(() => ({}))) as { days?: number };

  if (Number(days) < 0) {
    if (!rewind()) return Response.json({ error: "Nothing to rewind" }, { status: 400 });
    return Response.json({ state: getAppState(), checkinMessageId: null });
  }

  saveSnapshot();
  setStateValue(getDb(), "sim_offset_days", String(simOffsetDays() + Number(days)));
  const checkin = await runTick();
  return Response.json({ state: getAppState(), checkinMessageId: checkin?.id ?? null });
}
