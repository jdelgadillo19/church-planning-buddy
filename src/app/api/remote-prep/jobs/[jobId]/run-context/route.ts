import { NextResponse } from "next/server";
import { parseRemotePrepAuthorization } from "@/lib/remote-prep/auth";
import { applyRemotePrepCors } from "@/lib/remote-prep/client-cors";
import { authenticateRemotePrepJob } from "@/lib/remote-prep/jobs";

type RouteContext = { params: Promise<{ jobId: string }> };

/** GET — run context for Grapevine Client remote prep worker. */
export async function GET(req: Request, context: RouteContext) {
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

    const origin = new URL(req.url).origin;
    return applyRemotePrepCors(
      NextResponse.json({
        ok: true,
        job: {
          id: job.id,
          orgId: job.org_id,
          planId: job.plan_id,
          serviceTypeId: job.service_type_id,
          status: job.status,
          commitPlan: job.commit_plan,
          librarySelections: job.library_selections,
          pullId: job.pull_id,
          pullFileName: job.pull_file_name,
          pullManifest: job.pull_manifest,
          expiresAt: job.expires_at,
        },
        apiBaseUrl: origin,
        pullDownloadPath: `/api/remote-prep/jobs/${job.id}/pull`,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load remote prep context.";
    return applyRemotePrepCors(
      NextResponse.json({ ok: false, error: message }, { status: 400 }),
    );
  }
}

export async function OPTIONS() {
  return applyRemotePrepCors(new NextResponse(null, { status: 204 }));
}
