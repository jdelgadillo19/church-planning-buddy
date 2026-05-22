import { NextResponse } from "next/server";
import { loadPlanBundle } from "@/lib/pco/plan-bundle";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { planId?: string; serviceTypeId?: string };
    const bundle = await loadPlanBundle({
      planId: body.planId ?? "",
      serviceTypeId: body.serviceTypeId,
    });
    return NextResponse.json({ ok: true, bundle });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load plan.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
