import { parsePositiveIntOrNull, pcoGetJsonOrThrow } from "./client";

type PcoPlan = {
  id: string;
  attributes?: {
    sort_date?: string;
    dates?: string;
    short_dates?: string;
    title?: string | null;
  };
  relationships?: {
    service_type?: { data?: { id?: string } | null };
  };
};

type PcoPlanCollection = {
  data?: PcoPlan[];
  links?: { next?: string | null };
};

type PcoServiceType = {
  id: string;
  attributes?: { name?: string | null };
};

type PcoServiceTypeCollection = {
  data?: PcoServiceType[];
  links?: { next?: string | null };
};

type PcoPerson = {
  id?: string;
};

type PcoCampus = {
  id?: string;
  attributes?: { name?: string | null };
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

export type UpcomingPlanOption = UpcomingPlanRef & {
  label: string;
  dateKey: string;
  timeLabel: string;
  serviceTypeName?: string;
};

export type PcoServiceTypeRef = {
  serviceTypeId: number;
  name: string;
};

export type ScopedUpcomingPlans = {
  scopeName: string;
  scopeSource: "env" | "profile";
  serviceTypes: PcoServiceTypeRef[];
  plans: UpcomingPlanOption[];
  defaultPlanId?: number;
};

function normalizedText(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, " ");
}

function localDateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(plan: PcoPlan, d: Date) {
  const fromPco = plan.attributes?.short_dates?.trim() || plan.attributes?.dates?.trim();
  if (fromPco) return fromPco;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatTimeLabel(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function optionLabel(option: UpcomingPlanOption, duplicateDate: boolean) {
  if (!duplicateDate) return option.dateLabel;
  return `${option.dateLabel} — ${option.timeLabel}`;
}

function isDefaultSundayServiceType(name: string) {
  return /\b(weekend|weekends|sunday|services)\b/i.test(name);
}

function buildUpcomingOptions(
  candidates: Array<{ plan: PcoPlan; date: Date; serviceTypeId: number; serviceTypeName?: string }>,
) {
  const dateCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = localDateKey(candidate.date);
    dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
  }

  return candidates.flatMap(({ plan, date, serviceTypeId, serviceTypeName }) => {
    const planId = parsePositiveIntOrNull(plan.id);
    if (!planId) return [];

    const sortDate = plan.attributes?.sort_date ?? plan.attributes?.dates ?? "";
    const dateKey = localDateKey(date);
    const dateLabel = formatDateLabel(plan, date);
    const timeLabel = formatTimeLabel(date);
    const option: UpcomingPlanOption = {
      planId,
      serviceTypeId,
      sortDate: String(sortDate),
      dateLabel,
      timeLabel,
      dateKey,
      serviceTypeName,
      label: "",
    };

    return [{ ...option, label: optionLabel(option, (dateCounts.get(dateKey) ?? 0) > 1) }];
  });
}

function disambiguatePlanLabels(plans: UpcomingPlanOption[]) {
  const labelCounts = new Map<string, number>();
  for (const plan of plans) {
    labelCounts.set(plan.label, (labelCounts.get(plan.label) ?? 0) + 1);
  }

  return plans.map((plan) => {
    if ((labelCounts.get(plan.label) ?? 0) <= 1 || !plan.serviceTypeName) return plan;
    return { ...plan, label: `${plan.label} — ${plan.serviceTypeName}` };
  });
}

/** Upcoming plans for a service type, sorted from closest to farthest. */
export async function loadUpcomingPlans(
  serviceTypeId: number,
  auth: string,
  serviceTypeName?: string,
): Promise<UpcomingPlanOption[]> {
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
    .filter((x): x is { plan: PcoPlan; date: Date } => x.date !== null && x.date >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((candidate) => ({ ...candidate, serviceTypeId, serviceTypeName }));

  return buildUpcomingOptions(candidates);
}

export async function loadServiceTypes(auth: string): Promise<PcoServiceTypeRef[]> {
  const serviceTypes: PcoServiceTypeRef[] = [];
  let url: string | null =
    "https://api.planningcenteronline.com/services/v2/service_types?per_page=100";

  while (url) {
    const json = (await pcoGetJsonOrThrow(url, auth)) as PcoServiceTypeCollection;
    for (const row of json.data ?? []) {
      const serviceTypeId = parsePositiveIntOrNull(row.id);
      if (!serviceTypeId) continue;
      serviceTypes.push({
        serviceTypeId,
        name: row.attributes?.name?.trim() || `Service type ${serviceTypeId}`,
      });
    }
    url = json.links?.next ?? null;
  }

  return serviceTypes;
}

export async function loadCurrentPersonPrimaryCampusName(auth: string): Promise<string | null> {
  const meJson = (await pcoGetJsonOrThrow(
    "https://api.planningcenteronline.com/people/v2/me",
    auth,
  )) as { data?: PcoPerson };
  const personId = meJson.data?.id?.trim();
  if (!personId) return null;

  const campusJson = (await pcoGetJsonOrThrow(
    `https://api.planningcenteronline.com/people/v2/people/${personId}/primary_campus`,
    auth,
  )) as { data?: PcoCampus | null };
  return campusJson.data?.attributes?.name?.trim() || null;
}

export async function loadScopedUpcomingPlans(
  auth: string,
  explicitScopeName?: string,
): Promise<ScopedUpcomingPlans> {
  const envScope = explicitScopeName?.trim();
  const profileScope = envScope ? null : await loadCurrentPersonPrimaryCampusName(auth);
  const scopeName = envScope || profileScope;
  if (!scopeName) {
    throw new Error(
      "Could not determine Planning Center campus scope. Set PCO_PLAN_SCOPE_CAMPUS_NAME in .env.local.",
    );
  }

  const normalizedScope = normalizedText(scopeName);
  const serviceTypes = (await loadServiceTypes(auth)).filter((serviceType) =>
    normalizedText(serviceType.name).includes(normalizedScope),
  );

  if (serviceTypes.length === 0) {
    throw new Error(`No Planning Center service types matched campus scope "${scopeName}".`);
  }

  const groups = await Promise.all(
    serviceTypes.map(async (serviceType) => {
      const plans = await loadUpcomingPlans(
        serviceType.serviceTypeId,
        auth,
        serviceType.name,
      );
      return { serviceType, plans };
    }),
  );
  const plans = disambiguatePlanLabels(
    groups.flatMap((group) => group.plans),
  ).toSorted((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime());
  const defaultPlan =
    plans.find(
      (plan) =>
        isSunday(new Date(plan.sortDate)) &&
        isDefaultSundayServiceType(plan.serviceTypeName ?? ""),
    ) ?? plans[0];

  return {
    scopeName,
    scopeSource: envScope ? "env" : "profile",
    serviceTypes,
    plans,
    defaultPlanId: defaultPlan?.planId,
  };
}

/** Next future Sunday plan for a service type (worship services). */
export async function loadNextSundayPlan(
  serviceTypeId: number,
  auth: string,
): Promise<UpcomingPlanRef | null> {
  const upcoming = await loadUpcomingPlans(serviceTypeId, auth);
  return upcoming.find((plan) => isSunday(new Date(plan.sortDate))) ?? null;
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
