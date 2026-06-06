import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import {
  claimNextPendingJob,
  createSlideDeckJob,
  listSlideDeckJobsForUser,
} from "@/lib/slide-deck/agent-jobs";
import { isSlideDeckAgentAuthorized } from "@/lib/slide-deck/agent-auth";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";

/** GET — agent claims next pending job, or user lists recent jobs. */
export async function GET(req: Request) {
  try {
    if (isSlideDeckAgentAuthorized(req)) {
      const job = await claimNextPendingJob();
      return NextResponse.json({ ok: true, job });
    }

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

    const jobs = await listSlideDeckJobsForUser(user.id, 15);
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list jobs.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** POST — user queues a job for the Mac agent. */
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
      planId?: string;
      serviceTypeId?: string;
      commitPlan?: MockCommitPlan;
      librarySelections?: Record<string, string>;
      resolution?: "overwrite";
      publishAfterApply?: boolean;
    };

    if (!body.planId?.trim() || !body.commitPlan?.playlistName) {
      return NextResponse.json(
        { ok: false, error: "planId and commitPlan are required." },
        { status: 400 },
      );
    }

    const job = await createSlideDeckJob({
      userId: user.id,
      planId: body.planId.trim(),
      serviceTypeId: body.serviceTypeId?.trim() || undefined,
      commitPlan: body.commitPlan,
      librarySelections: body.librarySelections,
      resolution: body.resolution,
      publishAfterApply: body.publishAfterApply !== false,
    });

    return NextResponse.json({ ok: true, job });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to queue job.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
