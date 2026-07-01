import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { parseRemotePrepAuthorization } from "@/lib/remote-prep/auth";
import { applyRemotePrepCors } from "@/lib/remote-prep/client-cors";
import {
  authenticateRemotePrepJob,
  completeRemotePrepJob,
  failRemotePrepJob,
  getRemotePrepJobById,
  markRemotePrepJobCancelled,
  markRemotePrepJobRunning,
  updateRemotePrepProgress,
} from "@/lib/remote-prep/jobs";
import type { RemotePrepProgress } from "@/lib/remote-prep/progress";

type RouteContext = { params: Promise<{ jobId: string }> };

/** GET — job status for worker (token auth) or owning user (session). */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const auth = parseRemotePrepAuthorization(req.headers.get("authorization"));

    if (auth && auth.jobId === jobId) {
      const job = await authenticateRemotePrepJob(jobId, auth.token);
      if (!job) {
        return applyRemotePrepCors(
          NextResponse.json({ ok: false, error: "Remote prep job not found or expired." }, { status: 404 }),
        );
      }
      return applyRemotePrepCors(
        NextResponse.json({
          ok: true,
          status: job.status,
          progress: job.progress,
          cancelRequested: Boolean(job.cancel_requested_at) || job.status === "cancelled",
        }),
      );
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
      cancelRequested: Boolean(job.cancel_requested_at) || job.status === "cancelled",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load remote prep job.";
    return applyRemotePrepCors(NextResponse.json({ ok: false, error: message }, { status: 400 }));
  }
}

/** PATCH — update remote prep job status from Grapevine Client. */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { jobId } = await context.params;
    const auth = parseRemotePrepAuthorization(req.headers.get("authorization"));
    if (!auth || auth.jobId !== jobId) {
      return applyRemotePrepCors(
        NextResponse.json({ ok: false, error: "Remote prep job not authorized." }, { status: 401 }),
      );
    }

    const job = await authenticateRemotePrepJob(jobId, auth.token);
    if (!job) {
      return applyRemotePrepCors(
        NextResponse.json({ ok: false, error: "Remote prep job not found or expired." }, { status: 404 }),
      );
    }

    const body = (await req.json()) as {
      status?: "running" | "completed" | "failed" | "cancelled";
      result?: Record<string, unknown>;
      error?: string;
      progress?: RemotePrepProgress;
    };

    if (body.progress) {
      await updateRemotePrepProgress(jobId, body.progress);
    }

    if (body.status === "running") {
      await markRemotePrepJobRunning(jobId);
    } else if (body.status === "completed") {
      await completeRemotePrepJob(jobId, body.result ?? {});
    } else if (body.status === "failed") {
      await failRemotePrepJob(jobId, body.error?.trim() || "Remote prep failed.");
    } else if (body.status === "cancelled") {
      await markRemotePrepJobCancelled(jobId);
    } else if (!body.progress) {
      return applyRemotePrepCors(
        NextResponse.json({ ok: false, error: "Unsupported status update." }, { status: 400 }),
      );
    }

    return applyRemotePrepCors(NextResponse.json({ ok: true }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update remote prep job.";
    return applyRemotePrepCors(
      NextResponse.json({ ok: false, error: message }, { status: 400 }),
    );
  }
}

export async function OPTIONS() {
  return applyRemotePrepCors(new NextResponse(null, { status: 204 }));
}
