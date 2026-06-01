import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { pcoDefaultPlanId, pcoServiceTypeId } from "@/lib/config/messaging";
import { buildAuthHeader } from "@/lib/pco/client";
import { loadPlanTeamMembersAllStatuses } from "@/lib/pco/plan-members-all";
import {
  loadNextSundayPlan,
  resolveServiceTypeIdForMessaging,
} from "@/lib/pco/upcoming-plan";
import { loadMessageLibrary, pickMessageVariant } from "./message-library";
import {
  ownerAssignmentsFromPlanMembers,
  resolveOwnerMessagingContext,
} from "./owner-context";
import type { MessagingWorkflow, SendPlan } from "./types";

export async function buildSendPlanForWorkflow(
  workflow: MessagingWorkflow,
  tokens: GoogleTokens,
  overrides?: { group?: string; purpose?: string },
): Promise<SendPlan> {
  const group = overrides?.group?.trim() || workflow.targetGroup;
  const purpose = overrides?.purpose?.trim() || workflow.purpose;

  const auth = buildAuthHeader();
  if (!auth) throw new Error("Planning Center auth missing.");

  const serviceTypeId = await resolveServiceTypeIdForMessaging(
    auth,
    pcoServiceTypeId(),
    pcoDefaultPlanId(),
  );

  const upcoming = await loadNextSundayPlan(serviceTypeId, auth);
  let context = "normal";
  let planId: number | undefined;
  let planDate: string | undefined;

  if (upcoming) {
    planId = upcoming.planId;
    planDate = upcoming.dateLabel;
    const members = await loadPlanTeamMembersAllStatuses(
      serviceTypeId,
      upcoming.planId,
      auth,
    );
    const ownerRows = ownerAssignmentsFromPlanMembers(
      members.map((m) => ({
        personId: m.personId,
        status: m.status,
        teamName: m.teamName,
        positionName: m.pcoPositionName,
      })),
    );
    context = resolveOwnerMessagingContext(ownerRows);
  }

  const { rows, errors } = await loadMessageLibrary(tokens);
  if (errors.length > 0) throw new Error(errors.join("; "));

  const picked = pickMessageVariant(rows, { group, purpose, context });
  if (!picked) {
    throw new Error(
      `No enabled message for Group="${group}", Purpose="${purpose}", Context="${context}".`,
    );
  }

  return {
    workflowId: workflow.id,
    group,
    purpose,
    context,
    variant: picked.variant,
    message: picked.message,
    planId,
    planDate,
  };
}
