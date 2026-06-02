import { NextResponse } from "next/server";
import { buildAuthHeader, parsePositiveIntOrNull } from "@/lib/pco/client";
import {
  loadScopedUpcomingPlans,
  loadUpcomingPlans,
} from "@/lib/pco/upcoming-plan";

function envCampusScope() {
  return process.env.PCO_PLAN_SCOPE_CAMPUS_NAME?.trim() || undefined;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { serviceTypeId?: string };
    const auth = buildAuthHeader();
    if (!auth) {
      throw new Error(
        "Missing Planning Center auth. Set PCO_ACCESS_TOKEN or PCO_BASIC_TOKEN in .env.local.",
      );
    }

    const explicitServiceTypeId = parsePositiveIntOrNull(body.serviceTypeId ?? "");

    if (explicitServiceTypeId) {
      const scoped = await loadScopedUpcomingPlans(auth, envCampusScope());
      const serviceType = scoped.serviceTypes.find(
        (option) => option.serviceTypeId === explicitServiceTypeId,
      );
      if (!serviceType) {
        throw new Error(
          `Service type ${explicitServiceTypeId} is outside campus scope "${scoped.scopeName}".`,
        );
      }
      const plans = await loadUpcomingPlans(serviceType.serviceTypeId, auth, serviceType.name);
      return NextResponse.json({
        ok: true,
        serviceTypeId: serviceType.serviceTypeId,
        scopeName: scoped.scopeName,
        scopeSource: scoped.scopeSource,
        serviceTypes: scoped.serviceTypes,
        plans,
      });
    }

    const scoped = await loadScopedUpcomingPlans(auth, envCampusScope());
    return NextResponse.json({
      ok: true,
      scopeName: scoped.scopeName,
      scopeSource: scoped.scopeSource,
      serviceTypes: scoped.serviceTypes,
      defaultPlanId: scoped.defaultPlanId,
      plans: scoped.plans,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load upcoming plans.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
