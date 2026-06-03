import type {
  PcoServiceTypeRef,
  UpcomingPlanOption,
} from "./upcoming-plan";

export type { PcoServiceTypeRef, UpcomingPlanOption, ScopedUpcomingPlans } from "./upcoming-plan";

export type PlanScope = {
  name: string;
  source: "env" | "profile";
};

export type PlanSelection = {
  planId: string;
  serviceTypeId: string;
};

export type UpcomingPlansSuccess = {
  ok: true;
  serviceTypeId?: number;
  scopeName?: string;
  scopeSource?: "env" | "profile";
  defaultPlanId?: number;
  serviceTypes?: PcoServiceTypeRef[];
  plans: UpcomingPlanOption[];
};

export type UpcomingPlansFailure = {
  ok: false;
  error: string;
};

export type UpcomingPlansResponse = UpcomingPlansSuccess | UpcomingPlansFailure;

/** Keep current plan if still listed, else default, else first. */
export function resolvePlanSelection(
  plans: UpcomingPlanOption[],
  defaultPlanId?: number,
  currentPlanId?: string,
): PlanSelection | null {
  if (plans.length === 0) return null;

  const currentPlan = currentPlanId
    ? plans.find((plan) => String(plan.planId) === currentPlanId)
    : undefined;
  const defaultPlan =
    defaultPlanId !== undefined
      ? plans.find((plan) => plan.planId === defaultPlanId) ?? null
      : null;
  const nextPlan = currentPlan ?? defaultPlan ?? plans[0] ?? null;
  if (!nextPlan) return null;

  return {
    planId: String(nextPlan.planId),
    serviceTypeId: String(nextPlan.serviceTypeId),
  };
}

export async function fetchUpcomingPlans(
  serviceTypeId?: string,
): Promise<UpcomingPlansResponse> {
  const res = await fetch("/api/mvp/upcoming-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      serviceTypeId: serviceTypeId?.trim() || undefined,
    }),
  });
  const payload = (await res.json()) as UpcomingPlansResponse;
  if (!res.ok || !payload.ok) {
    return {
      ok: false,
      error: payload.ok ? "Failed to load upcoming plans." : payload.error,
    };
  }
  return payload;
}
