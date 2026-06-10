import { NextResponse } from "next/server";
import {
  createSlideDeckSubmission,
  listDraftSubmissionsForScope,
} from "@/lib/pp-platform/submissions";
import { canQueueBuilds, resolveUserOrg } from "@/lib/pp-platform/org-context";
import { assertCommitPlanReadyForQueue } from "@/lib/slide-deck/commit-guards";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";
import { librarySelectionsByElementKey } from "@/lib/slide-deck/plan-element-key";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

function parseScope(url: URL, body?: Record<string, unknown>) {
  const planId = (body?.planId ?? url.searchParams.get("planId"))?.toString().trim();
  const playlistName = (body?.playlistName ?? url.searchParams.get("playlistName"))
    ?.toString()
    .trim();
  const serviceTypeId = (
    body?.serviceTypeId ?? url.searchParams.get("serviceTypeId")
  )?.toString().trim();
  return { planId, playlistName, serviceTypeId: serviceTypeId || undefined };
}

/** GET — list draft submissions for a service scope. */
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

    const { planId, playlistName, serviceTypeId } = parseScope(url);
    if (!planId || !playlistName) {
      return NextResponse.json(
        { ok: false, error: "planId and playlistName are required." },
        { status: 400 },
      );
    }

    const submissions = await listDraftSubmissionsForScope({
      orgId: org.orgId,
      planId,
      playlistName,
      serviceTypeId,
    });

    return NextResponse.json({ ok: true, submissions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list submissions.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** POST — save a submitted plan draft. */
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
      commitPlan?: MockCommitPlan;
      librarySelections?: Record<string, string>;
      manifest?: SlideDeckManifest;
      changeSummary?: string;
    };

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }
    if (!canQueueBuilds(org.role)) {
      return NextResponse.json({ ok: false, error: "Planner or admin role required." }, { status: 403 });
    }

    if (!body.planId?.trim() || !body.playlistName?.trim() || !body.commitPlan) {
      return NextResponse.json(
        { ok: false, error: "planId, playlistName, and commitPlan are required." },
        { status: 400 },
      );
    }

    assertCommitPlanReadyForQueue(body.commitPlan, body.librarySelections ?? {});

    const librarySelections = librarySelectionsByElementKey(
      body.commitPlan,
      body.librarySelections ?? {},
    );

    const submission = await createSlideDeckSubmission({
      orgId: org.orgId,
      planId: body.planId.trim(),
      serviceTypeId: body.serviceTypeId?.trim(),
      playlistName: body.playlistName.trim(),
      createdBy: user.id,
      commitPlan: body.commitPlan,
      librarySelections,
      manifest: body.manifest ?? null,
      changeSummary: body.changeSummary?.trim() || body.commitPlan.playlistName,
    });

    return NextResponse.json({ ok: true, submission });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save submission.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
