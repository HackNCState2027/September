import { getDb, setStateValue } from "@/lib/db";
import { simOffsetDays } from "@/lib/clock";
import { runTick } from "@/lib/checkin";
import { getAppState } from "@/lib/state";

export async function POST(request: Request) {
  const { days = 7 } = (await request.json().catch(() => ({}))) as { days?: number };
  setStateValue(getDb(), "sim_offset_days", String(simOffsetDays() + Number(days)));
  const checkin = await runTick();
  return Response.json({ state: getAppState(), checkinMessageId: checkin?.id ?? null });
}
