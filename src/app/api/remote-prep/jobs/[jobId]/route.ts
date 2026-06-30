import { NextResponse } from "next/server";
import { parseRemotePrepAuthorization } from "@/lib/remote-prep/auth";
import { applyRemotePrepCors } from "@/lib/remote-prep/client-cors";
import {
  authenticateRemotePrepJob,
  completeRemotePrepJob,
  failRemotePrepJob,
  markRemotePrepJobRunning,
} from "@/lib/remote-prep/jobs";

type RouteContext = { params: Promise<{ jobId: string }> };

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
      status?: "running" | "completed" | "failed";
      result?: Record<string, unknown>;
      error?: string;
    };

    if (body.status === "running") {
      await markRemotePrepJobRunning(jobId);
    } else if (body.status === "completed") {
      await completeRemotePrepJob(jobId, body.result ?? {});
    } else if (body.status === "failed") {
      await failRemotePrepJob(jobId, body.error?.trim() || "Remote prep failed.");
    } else {
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
