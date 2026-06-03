import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildPlaylistNameFromPlanDate } from "./playlist-name";

/** Target ProPresenter playlist name for a PCO plan (no library scan). */
export async function resolvePlaylistNameForPlan(input: {
  planId: string;
  serviceTypeId?: string;
}): Promise<string> {
  const plan = await loadPlanServiceOrder({
    planId: input.planId,
    serviceTypeId: input.serviceTypeId,
  });
  return buildPlaylistNameFromPlanDate(plan.dateRaw);
}
