import { isConfirmedTeamMemberStatus } from "@/lib/pco/plan-team";
import { pcoOwnerPersonId } from "@/lib/config/messaging";
import type { MessagingContext } from "./types";

const DECLINED_STATUSES = new Set(["d", "declined"]);

export function isDeclinedStatus(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  return DECLINED_STATUSES.has(status.trim().toLowerCase());
}

export type OwnerPlanAssignment = {
  status: string;
  teamName?: string;
  positionName?: string;
};

/** Away when owner has any declined assignment and no confirmed assignment on the plan. */
export function resolveOwnerMessagingContext(
  assignments: OwnerPlanAssignment[],
  ownerPersonId: string = pcoOwnerPersonId(),
): MessagingContext {
  const mine = assignments.filter((a) => a.status); // caller filters by person
  void ownerPersonId;

  let hasDeclined = false;
  let hasConfirmed = false;
  for (const row of mine) {
    if (isDeclinedStatus(row.status)) hasDeclined = true;
    if (isConfirmedTeamMemberStatus(row.status)) hasConfirmed = true;
  }

  if (hasDeclined && !hasConfirmed) return "away";
  return "normal";
}

export type PlanTeamMemberRaw = {
  personId: string;
  status: string;
  teamName?: string;
  positionName?: string;
};

export function ownerAssignmentsFromPlanMembers(
  members: PlanTeamMemberRaw[],
  ownerPersonId: string = pcoOwnerPersonId(),
): OwnerPlanAssignment[] {
  return members
    .filter((m) => m.personId === ownerPersonId)
    .map((m) => ({
      status: m.status,
      teamName: m.teamName,
      positionName: m.positionName,
    }));
}
