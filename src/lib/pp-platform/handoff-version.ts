import type { HandoffStatus } from "./types";
import { listHandoffsForPlan } from "./submissions";

/** Next sequenced label for cloud package folders (complete-v2, incomplete-v1, …). */
export async function nextHandoffVersionLabel(input: {
  orgId: string;
  planId: string;
  serviceTypeId?: string | null;
  handoffStatus: HandoffStatus;
}): Promise<string> {
  const existing = await listHandoffsForPlan({
    orgId: input.orgId,
    planId: input.planId,
    serviceTypeId: input.serviceTypeId,
  });
  const sameTag = existing.filter((h) => h.handoff_status === input.handoffStatus);
  return `${input.handoffStatus}-v${sameTag.length + 1}`;
}
