import { NextResponse } from "next/server";
import { createSlideDeckBuild, listSlideDeckBuildsForOrg } from "@/lib/pp-platform/builds";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import { canQueueBuilds, resolveUserOrg } from "@/lib/pp-platform/org-context";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

/** GET — list recent builds for user's org. */
export async function GET(req: Request) {
  try {
    if (!isGrapevineAuthEnabled()) {
      return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 401 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const url = new URL(req.url);
    const orgIdParam = url.searchParams.get("orgId")?.trim();
    const org = await resolveUserOrg(supabase, user.id, orgIdParam);
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }

    const builds = await listSlideDeckBuildsForOrg(org.orgId, 15);
    return NextResponse.json({ ok: true, builds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list builds.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** POST — queue a slide deck build for the presentation rig. */
export async function POST(req: Request) {
  try {
    if (!isGrapevineAuthEnabled()) {
      return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 401 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as {
      orgId?: string;
      rigId?: string;
      planId?: string;
      serviceTypeId?: string;
      commitPlan?: MockCommitPlan;
      librarySelections?: Record<string, string>;
      changeSummary?: string;
      publishAfterApply?: boolean;
    };

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }
    if (!canQueueBuilds(org.role)) {
      return NextResponse.json({ ok: false, error: "Planner or admin role required." }, { status: 403 });
    }

    if (!body.planId?.trim() || !body.commitPlan?.playlistName) {
      return NextResponse.json(
        { ok: false, error: "planId and commitPlan are required." },
        { status: 400 },
      );
    }

    const latestSnapshot = await getLatestSnapshotForOrg(org.orgId);

    const build = await createSlideDeckBuild({
      orgId: org.orgId,
      rigId: body.rigId?.trim() || undefined,
      createdBy: user.id,
      planId: body.planId.trim(),
      serviceTypeId: body.serviceTypeId?.trim(),
      commitPlan: body.commitPlan,
      librarySelections: body.librarySelections,
      changeSummary:
        body.changeSummary?.trim() ||
        `${body.commitPlan.playlistName} — ${body.planId.trim()}`,
      publishAfterApply: body.publishAfterApply,
      baseSnapshotId: latestSnapshot?.id,
    });

    return NextResponse.json({ ok: true, build });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to queue build.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
