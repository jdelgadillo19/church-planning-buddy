import { NextResponse } from "next/server";
import {
  createSlideDeckBuild,
  listSlideDeckBuildsForOrg,
} from "@/lib/pp-platform/builds";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import { canQueueBuilds, resolveUserOrg } from "@/lib/pp-platform/org-context";
import {
  buildInputFromSendMerge,
  computeSendMerge,
  finalizeSendMerge,
} from "@/lib/pp-platform/send-merge";
import { assertCommitPlanReadyForQueue } from "@/lib/slide-deck/commit-guards";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { ImplementationPlan } from "@/lib/slide-deck/implementation-plan";
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

/** POST — queue a slide deck build (merges draft submissions when present). */
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
      baselineCommitPlan?: MockCommitPlan;
      librarySelections?: Record<string, string>;
      changeSummary?: string;
      publishAfterApply?: boolean;
      previewOnly?: boolean;
      implementationPlan?: ImplementationPlan;
      rowSourceOverrides?: Record<string, string>;
      mergeMode?: "auto" | "same_user_full" | "same_user_selective";
      selectedElementKeysFromLatest?: string[];
    };

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }
    if (!canQueueBuilds(org.role)) {
      return NextResponse.json({ ok: false, error: "Planner or admin role required." }, { status: 403 });
    }

    const baseline = body.baselineCommitPlan ?? body.commitPlan;
    if (baseline && !body.previewOnly) {
      assertCommitPlanReadyForQueue(baseline, body.librarySelections ?? {});
    }
    if (!body.planId?.trim() || !baseline?.playlistName) {
      return NextResponse.json(
        { ok: false, error: "planId and commitPlan are required." },
        { status: 400 },
      );
    }

    const playlistName = baseline.playlistName.trim();
    const scope = {
      orgId: org.orgId,
      planId: body.planId.trim(),
      serviceTypeId: body.serviceTypeId?.trim(),
      playlistName,
    };

    const outcome = await computeSendMerge({
      scope,
      userId: user.id,
      baselineCommitPlan: baseline,
      commitPlan: body.commitPlan,
      librarySelections: body.librarySelections,
      rowSourceOverrides: body.rowSourceOverrides,
      mergeMode: body.mergeMode ?? "auto",
      selectedElementKeysFromLatest: body.selectedElementKeysFromLatest,
      implementationPlan: body.implementationPlan,
    });

    if (body.previewOnly) {
      return NextResponse.json({
        ok: true,
        implementationPlan: outcome.implementationPlan,
        conflicts: outcome.merge.conflicts,
        needsReview: outcome.merge.needsReview,
        draftCount: outcome.mergedSubmissionIds.length,
      });
    }

    if (outcome.merge.needsReview && !body.rowSourceOverrides && !body.implementationPlan) {
      return NextResponse.json(
        {
          ok: false,
          needsReview: true,
          conflicts: outcome.merge.conflicts,
          implementationPlan: outcome.implementationPlan,
          error: "Merge conflicts require review before sending.",
        },
        { status: 409 },
      );
    }

    const latestSnapshot = await getLatestSnapshotForOrg(org.orgId);
    const buildInput = buildInputFromSendMerge(
      {
        scope,
        userId: user.id,
        baselineCommitPlan: baseline,
        commitPlan: body.commitPlan,
        librarySelections: body.librarySelections,
        createdBy: user.id,
        rigId: body.rigId?.trim(),
        changeSummary: body.changeSummary?.trim() || playlistName,
      },
      outcome,
    );

    buildInput.publishAfterApply = body.publishAfterApply === true;
    buildInput.baseSnapshotId = latestSnapshot?.id;

    await finalizeSendMerge(outcome);
    const build = await createSlideDeckBuild(buildInput);

    return NextResponse.json({ ok: true, build });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to queue build.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
