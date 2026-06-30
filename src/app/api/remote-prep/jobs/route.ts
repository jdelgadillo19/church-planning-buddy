import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { prepareFilebasePullForPlan } from "@/lib/remote-prep/prepare-filebase-pull";
import { buildRemotePrepDeepLink, createRemotePrepJob } from "@/lib/remote-prep/jobs";

/** POST — create a remote prep job and deep link for Grapevine Client. */
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
      librarySelections?: Record<string, string>;
    };

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }

    const planId = body.planId?.trim() ?? "";
    if (!planId) {
      return NextResponse.json({ ok: false, error: "planId is required." }, { status: 400 });
    }

    const prepared = await prepareFilebasePullForPlan({
      orgId: org.orgId,
      userId: user.id,
      planId,
      serviceTypeId: body.serviceTypeId?.trim() || undefined,
      librarySelections: body.librarySelections ?? {},
    });

    const { job, clientToken } = await createRemotePrepJob({
      orgId: org.orgId,
      userId: user.id,
      planId,
      serviceTypeId: body.serviceTypeId?.trim() || undefined,
      commitPlan: prepared.commitPlan,
      librarySelections: body.librarySelections ?? {},
      pullId: prepared.pullId,
      pullFileName: prepared.fileName,
      pullManifest: prepared.pullManifest,
    });

    const origin = new URL(req.url).origin;
    const deepLink = buildRemotePrepDeepLink({
      jobId: job.id,
      clientToken,
      origin,
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      deepLink,
      expiresAt: job.expires_at,
      playlistName: prepared.commitPlan.playlistName,
      pullManifest: prepared.pullManifest,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Remote prep job failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
