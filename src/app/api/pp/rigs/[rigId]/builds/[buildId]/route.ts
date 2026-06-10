import { NextResponse } from "next/server";
import {
  getBuildById,
  resetBuildForRetry,
  setBuildStatus,
  updateBuildImplementationPlan,
} from "@/lib/pp-platform/builds";
import { authenticateRigOrBootstrap } from "@/lib/pp-platform/rig-auth";
import type { SlideDeckBuildRow } from "@/lib/pp-platform/types";

type RouteContext = { params: Promise<{ rigId: string; buildId: string }> };

/** PATCH — rig reports applying / completed / failed. */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { rigId, buildId } = await context.params;
    const rig = await authenticateRigOrBootstrap(req, rigId);
    if (!rig || rig.id !== rigId) {
      return NextResponse.json({ ok: false, error: "Rig not authorized." }, { status: 401 });
    }

    const build = await getBuildById(buildId);
    if (!build || build.org_id !== rig.org_id) {
      return NextResponse.json({ ok: false, error: "Build not found." }, { status: 404 });
    }
    if (build.rig_id && build.rig_id !== rigId) {
      return NextResponse.json({ ok: false, error: "Build assigned to another rig." }, { status: 403 });
    }

    const body = (await req.json()) as {
      status?: SlideDeckBuildRow["status"];
      result?: SlideDeckBuildRow["result"];
      error?: string;
      implementationPlan?: SlideDeckBuildRow["implementation_plan"];
      resetToClaimed?: boolean;
    };

    if (body.resetToClaimed) {
      const updated = await resetBuildForRetry(buildId);
      return NextResponse.json({ ok: true, build: updated });
    }

    const allowed = new Set(["applying", "completed", "failed", "claimed"]);
    if (body.implementationPlan && !body.status) {
      const updated = await updateBuildImplementationPlan(buildId, body.implementationPlan);
      return NextResponse.json({ ok: true, build: updated });
    }

    if (!body.status || !allowed.has(body.status)) {
      return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
    }

    const updated = await setBuildStatus(buildId, body.status, {
      result: body.result,
      error_message: body.error ?? null,
    });

    return NextResponse.json({ ok: true, build: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update build.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
