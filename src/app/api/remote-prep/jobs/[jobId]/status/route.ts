import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { getRemotePrepJobById, requestRemotePrepCancel } from "@/lib/remote-prep/jobs";

type RouteContext = { params: Promise<{ jobId: string }> };

/** GET — poll remote prep job status for the owning user. */
export async function GET(_req: Request, context: RouteContext) {
  try {
    if (!isGrapevineAuthEnabled()) {
      return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 401 });
    }

    const { jobId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const job = await getRemotePrepJobById(jobId);
    if (!job || job.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Remote prep job not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      errorMessage: job.error_message,
      playlistName: job.commit_plan?.playlistName ?? null,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load remote prep status.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
