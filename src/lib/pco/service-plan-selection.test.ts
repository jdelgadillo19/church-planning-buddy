import { resolvePlanSelection } from "./service-plan-selection";
import type { UpcomingPlanOption } from "./upcoming-plan";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function samplePlan(
  planId: number,
  serviceTypeId: number,
  label = `Plan ${planId}`,
): UpcomingPlanOption {
  return {
    planId,
    serviceTypeId,
    sortDate: "2026-06-07T10:00:00Z",
    dateLabel: label,
    timeLabel: "10:00 AM",
    dateKey: "2026-06-07",
    label,
  };
}

{
  assert(resolvePlanSelection([], 1, "1") === null, "empty plans");
}

{
  const plans = [samplePlan(1, 10), samplePlan(2, 20)];
  assert(
    resolvePlanSelection(plans, 1, "2")?.planId === "2" &&
      resolvePlanSelection(plans, 1, "2")?.serviceTypeId === "20",
    "keep current",
  );
}

{
  const plans = [samplePlan(1, 10), samplePlan(2, 20)];
  const sel = resolvePlanSelection(plans, 2, "999");
  assert(sel?.planId === "2" && sel?.serviceTypeId === "20", "stale current -> default");
}

{
  const plans = [samplePlan(1, 10), samplePlan(2, 20)];
  const sel = resolvePlanSelection(plans, undefined, "");
  assert(sel?.planId === "1" && sel?.serviceTypeId === "10", "first plan fallback");
}

console.log("service-plan-selection tests ok");
