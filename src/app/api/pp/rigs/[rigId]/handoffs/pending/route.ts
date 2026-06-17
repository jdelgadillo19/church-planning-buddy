import { NextResponse } from "next/server";
import { listPendingRigHandoffs, markHandoffRigStatus } from "@/lib/pp-platform/submissions";
import { authenticateRigOrBootstrap } from "@/lib/pp-platform/rig-auth";

type RouteContext = { params: Promise<{ rigId: string }> };

/** GET — presentation rig polls complete handoffs awaiting gatekeeper pull. */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { rigId } = await context.params;
    const rig = await authenticateRigOrBootstrap(req, rigId);
    if (!rig || rig.id !== rigId) {
      return NextResponse.json({ ok: false, error: "Rig not authorized." }, { status: 401 });
    }

    const handoffs = await listPendingRigHandoffs(rig.org_id);
    return NextResponse.json({ ok: true, handoffs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list handoffs.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** PATCH — rig reports handoff synced or skipped after gatekeeper review. */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { rigId } = await context.params;
    const rig = await authenticateRigOrBootstrap(req, rigId);
    if (!rig || rig.id !== rigId) {
      return NextResponse.json({ ok: false, error: "Rig not authorized." }, { status: 401 });
    }

    const body = (await req.json()) as {
      handoffId?: string;
      status?: "synced" | "skipped";
      servicesDriveUrl?: string;
    };

    if (!body.handoffId?.trim() || !body.status) {
      return NextResponse.json(
        { ok: false, error: "handoffId and status are required." },
        { status: 400 },
      );
    }

    await markHandoffRigStatus(body.handoffId.trim(), body.status, {
      servicesDriveUrl: body.servicesDriveUrl?.trim(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update handoff.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
