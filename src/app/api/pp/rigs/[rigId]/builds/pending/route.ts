import { NextResponse } from "next/server";
import {
  claimNextBuildForRig,
  listClaimedBuildsForRig,
} from "@/lib/pp-platform/builds";
import { authenticateRigOrBootstrap } from "@/lib/pp-platform/rig-auth";

type RouteContext = { params: Promise<{ rigId: string }> };

/** GET — claim next pending build or list claimed builds for this rig. */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { rigId } = await context.params;
    const rig = await authenticateRigOrBootstrap(req, rigId);
    if (!rig || rig.id !== rigId) {
      return NextResponse.json({ ok: false, error: "Rig not authorized." }, { status: 401 });
    }

    const url = new URL(req.url);
    const listOnly = url.searchParams.get("list") === "1";

    if (listOnly) {
      const builds = await listClaimedBuildsForRig(rigId);
      return NextResponse.json({ ok: true, builds });
    }

    const build = await claimNextBuildForRig(rig);
    return NextResponse.json({ ok: true, build });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to claim build.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
