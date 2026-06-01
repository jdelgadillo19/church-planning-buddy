import { parsePositiveIntOrNull, pcoGetJsonOrThrow } from "./client";

type PcoPlan = {
  id: string;
  attributes?: {
    sort_date?: string;
    dates?: string;
    short_dates?: string;
  };
};

type PcoPlanCollection = {
  data?: PcoPlan[];
  links?: { next?: string | null };
};

function planSortDate(plan: PcoPlan): Date | null {
  const raw = plan.attributes?.sort_date ?? plan.attributes?.dates ?? "";
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSunday(d: Date): boolean {
  return d.getDay() === 0;
}

export type UpcomingPlanRef = {
  planId: number;
  serviceTypeId: number;
  sortDate: string;
  dateLabel: string;
};

/** Next future Sunday plan for a service type (worship services). */
export async function loadNextSundayPlan(
  serviceTypeId: number,
  auth: string,
): Promise<UpcomingPlanRef | null> {
  const all: PcoPlan[] = [];
  let url: string | null =
    `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans?filter=future&order=sort_date&per_page=50`;

  while (url) {
    const json = (await pcoGetJsonOrThrow(url, auth)) as PcoPlanCollection;
    all.push(...(json.data ?? []));
    url = json.links?.next ?? null;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const candidates = all
    .map((plan) => ({ plan, date: planSortDate(plan) }))
    .filter((x): x is { plan: PcoPlan; date: Date } => x.date !== null && x.date >= now && isSunday(x.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const first = candidates[0];
  if (!first) return null;

  const planId = parsePositiveIntOrNull(first.plan.id);
  if (!planId) return null;

  const sortDate = first.plan.attributes?.sort_date ?? first.plan.attributes?.dates ?? "";
  const dateLabel =
    first.plan.attributes?.short_dates?.trim() ||
    first.plan.attributes?.dates?.trim() ||
    sortDate;

  return { planId, serviceTypeId, sortDate: String(sortDate), dateLabel };
}

export async function resolveServiceTypeIdForMessaging(
  auth: string,
  explicitServiceTypeId: number | null,
  fallbackPlanId: number | null,
): Promise<number> {
  if (explicitServiceTypeId) return explicitServiceTypeId;
  if (!fallbackPlanId) {
    throw new Error("Set PCO_SERVICE_TYPE_ID or PCO_DEFAULT_PLAN_ID in .env.local");
  }

  const planJson = await pcoGetJsonOrThrow(
    `https://api.planningcenteronline.com/services/v2/plans/${fallbackPlanId}`,
    auth,
  );
  const rawId = (
    planJson as { data?: { relationships?: { service_type?: { data?: { id?: string } } } } }
  ).data?.relationships?.service_type?.data?.id;
  const parsed = parsePositiveIntOrNull(rawId);
  if (!parsed) throw new Error("Could not resolve PCO service type ID.");
  return parsed;
}
