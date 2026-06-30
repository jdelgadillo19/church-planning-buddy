import { NextResponse } from "next/server";
import { loadStagedFilebasePull } from "@/lib/google/filebase-pull-store";
import { parseRemotePrepAuthorization } from "@/lib/remote-prep/auth";
import { applyRemotePrepCors } from "@/lib/remote-prep/client-cors";
import { authenticateRemotePrepJob } from "@/lib/remote-prep/jobs";

type RouteContext = { params: Promise<{ jobId: string }> };

/** GET — download staged filebase zip for a remote prep job. */
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
    if (!job?.pull_id) {
      return applyRemotePrepCors(
        NextResponse.json({ ok: false, error: "Remote prep job not found or expired." }, { status: 404 }),
      );
    }

    const staged = await loadStagedFilebasePull({
      orgId: job.org_id,
      pullId: job.pull_id,
    });
    if (!staged) {
      return applyRemotePrepCors(
        NextResponse.json({ ok: false, error: "Filebase pull zip expired or missing." }, { status: 404 }),
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${job.pull_file_name ?? `filebase-pull-${job.plan_id}.zip`}"`,
    );
    headers.set("Cache-Control", "no-store");

    return applyRemotePrepCors(new NextResponse(staged.body, { status: 200, headers }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to download filebase pull.";
    return applyRemotePrepCors(
      NextResponse.json({ ok: false, error: message }, { status: 400 }),
    );
  }
}

export async function OPTIONS() {
  return applyRemotePrepCors(new NextResponse(null, { status: 204 }));
}
