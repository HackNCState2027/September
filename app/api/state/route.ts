import { runTick } from "@/lib/checkin";
import { getAppState } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET() {
  await runTick();
  return Response.json(getAppState());
}
