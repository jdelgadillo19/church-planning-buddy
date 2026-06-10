import { NextResponse } from "next/server";
import { canQueueBuilds, resolveUserOrg } from "@/lib/pp-platform/org-context";
import { computeSendMerge } from "@/lib/pp-platform/send-merge";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

/** POST — preview merge for Send (no build queued). */
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
      planId?: string;
      serviceTypeId?: string;
      playlistName?: string;
      baselineCommitPlan?: MockCommitPlan;
      commitPlan?: MockCommitPlan;
      librarySelections?: Record<string, string>;
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

    if (!body.planId?.trim() || !body.playlistName?.trim() || !body.baselineCommitPlan) {
      return NextResponse.json(
        { ok: false, error: "planId, playlistName, and baselineCommitPlan are required." },
        { status: 400 },
      );
    }

    const outcome = await computeSendMerge({
      scope: {
        orgId: org.orgId,
        planId: body.planId.trim(),
        serviceTypeId: body.serviceTypeId?.trim(),
        playlistName: body.playlistName.trim(),
      },
      userId: user.id,
      baselineCommitPlan: body.baselineCommitPlan,
      commitPlan: body.commitPlan,
      librarySelections: body.librarySelections,
      rowSourceOverrides: body.rowSourceOverrides,
      mergeMode: body.mergeMode ?? "auto",
      selectedElementKeysFromLatest: body.selectedElementKeysFromLatest,
    });

    return NextResponse.json({
      ok: true,
      implementationPlan: outcome.implementationPlan,
      conflicts: outcome.merge.conflicts,
      needsReview: outcome.merge.needsReview,
      draftCount: outcome.mergedSubmissionIds.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to preview merge.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
