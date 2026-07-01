import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { getRemotePrepJobById, requestRemotePrepCancel } from "@/lib/remote-prep/jobs";

type RouteContext = { params: Promise<{ jobId: string }> };

/** POST — request cancellation of a running remote prep job. */
export async function POST(_req: Request, context: RouteContext) {
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

    const cancelled = await requestRemotePrepCancel(jobId, user.id);
    if (!cancelled) {
      const job = await getRemotePrepJobById(jobId);
      if (!job || job.user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Remote prep job not found." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        jobId,
        status: job.status,
        message: "Job is not running; cancel not applied.",
      });
    }

    const job = await getRemotePrepJobById(jobId);
    return NextResponse.json({
      ok: true,
      jobId,
      status: job?.status ?? "running",
      cancelRequested: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to cancel remote prep job.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
