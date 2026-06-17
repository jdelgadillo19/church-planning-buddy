import { NextResponse } from "next/server";
import {
  createSlideDeckSubmission,
  listDraftSubmissionsForScope,
  listHandoffsForPlan,
} from "@/lib/pp-platform/submissions";
import { resolveHandoffAuthorLabels } from "@/lib/pp-platform/handoff-authors";
import { canQueueBuilds, resolveUserOrg } from "@/lib/pp-platform/org-context";
import { assertCommitPlanReadyForQueue } from "@/lib/slide-deck/commit-guards";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";
import { librarySelectionsByElementKey } from "@/lib/slide-deck/plan-element-key";
import type { HandoffStatus } from "@/lib/pp-platform/types";
import type { MissingElement, MissingFileRef } from "@/lib/slide-deck/handoff";
import { queueServicesHandoffPublish } from "@/lib/slide-deck/services-handoff";
import { buildByoCommitPlan } from "@/lib/slide-deck/byo-commit-plan";
import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "@/lib/slide-deck/manifest";
import { nextHandoffVersionLabel } from "@/lib/pp-platform/handoff-version";
import { loadOrgLibrarianDrive } from "@/lib/google/org-librarian-drive";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getAuthedClients } from "@/lib/google/auth";
import { nativeExportFileName } from "@/lib/propresenter/playlist-native-export";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrgAdmin } from "@/lib/pp-platform/org-context";

function parseScope(url: URL, body?: Record<string, unknown>) {
  const planId = (body?.planId ?? url.searchParams.get("planId"))?.toString().trim();
  const playlistName = (body?.playlistName ?? url.searchParams.get("playlistName"))
    ?.toString()
    .trim();
  const serviceTypeId = (
    body?.serviceTypeId ?? url.searchParams.get("serviceTypeId")
  )?.toString().trim();
  const handoffsOnly = (body?.handoffsOnly ?? url.searchParams.get("handoffsOnly")) === "true"
    || url.searchParams.get("handoffsOnly") === "1";
  return { planId, playlistName, serviceTypeId: serviceTypeId || undefined, handoffsOnly };
}

/** GET — list merge drafts or upload handoffs for a service scope. */
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

    const { planId, playlistName, serviceTypeId, handoffsOnly } = parseScope(url);
    if (!planId) {
      return NextResponse.json({ ok: false, error: "planId is required." }, { status: 400 });
    }

    if (handoffsOnly) {
      const handoffs = await listHandoffsForPlan({
        orgId: org.orgId,
        planId,
        serviceTypeId,
      });
      const authors = await resolveHandoffAuthorLabels(handoffs.map((h) => h.created_by));
      return NextResponse.json({ ok: true, handoffs, authors });
    }

    if (!playlistName) {
      return NextResponse.json(
        { ok: false, error: "playlistName is required for merge drafts." },
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

/** POST — save a merge draft or remote-prep handoff (complete/incomplete). */
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
      allowIncomplete?: boolean;
      handoffStatus?: HandoffStatus;
      missingElements?: MissingElement[];
      missingFiles?: MissingFileRef[];
      parentHandoffId?: string;
      presentationInstanceId?: string;
      proplaylistBase64?: string;
      proplaylistFileName?: string;
      uploadSource?: "byo" | "grapevine";
      replaceOnRig?: boolean;
      adminApprovedForRig?: boolean;
      playlistItems?: Array<{ position: number; name: string }>;
      playlistNameOverride?: string;
    };

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }
    if (!canQueueBuilds(org.role)) {
      return NextResponse.json({ ok: false, error: "Planner or admin role required." }, { status: 403 });
    }

    if (!body.planId?.trim()) {
      return NextResponse.json({ ok: false, error: "planId is required." }, { status: 400 });
    }

    const isHandoff = body.handoffStatus === "complete" || body.handoffStatus === "incomplete";
    const isByo = body.uploadSource === "byo";

    let commitPlan = body.commitPlan;
    let manifest = body.manifest ?? null;

    if (!commitPlan && isHandoff && isByo && body.playlistItems?.length) {
      const plan = await loadPlanServiceOrder({
        planId: body.planId.trim(),
        serviceTypeId: body.serviceTypeId,
      });
      commitPlan = buildByoCommitPlan({
        planId: body.planId.trim(),
        serviceDateRaw: plan.dateRaw,
        playlistName: body.playlistNameOverride?.trim(),
        items: body.playlistItems,
      });
      manifest = buildSlideDeckManifest({ plan, templateSourceFound: null });
    }

    if (!commitPlan) {
      return NextResponse.json(
        { ok: false, error: "commitPlan is required (or BYO playlistItems)." },
        { status: 400 },
      );
    }

    const playlistName = body.playlistName?.trim() || commitPlan.playlistName;

    if (!isHandoff && body.allowIncomplete !== true) {
      assertCommitPlanReadyForQueue(commitPlan, body.librarySelections ?? {});
    }

    if (body.handoffStatus === "complete" && !isByo) {
      assertCommitPlanReadyForQueue(commitPlan, body.librarySelections ?? {});
    }

    const adminApprovedForRig =
      isHandoff &&
      body.handoffStatus === "complete" &&
      isOrgAdmin(org.role) &&
      body.adminApprovedForRig === true;

    const versionLabel = isHandoff
      ? await nextHandoffVersionLabel({
          orgId: org.orgId,
          planId: body.planId.trim(),
          serviceTypeId: body.serviceTypeId,
          handoffStatus: body.handoffStatus!,
        })
      : null;

    const librarySelections = librarySelectionsByElementKey(
      commitPlan,
      body.librarySelections ?? {},
    );

    const submission = await createSlideDeckSubmission({
      orgId: org.orgId,
      planId: body.planId.trim(),
      serviceTypeId: body.serviceTypeId?.trim(),
      playlistName,
      createdBy: user.id,
      commitPlan,
      librarySelections,
      manifest,
      changeSummary: body.changeSummary?.trim() || commitPlan.playlistName,
      handoffStatus: isHandoff ? body.handoffStatus : null,
      missingElements: body.missingElements,
      missingFiles: body.missingFiles,
      parentHandoffId: body.parentHandoffId ?? null,
      presentationInstanceId: body.presentationInstanceId,
      replaceOnRig: body.replaceOnRig ?? false,
      adminApprovedForRig,
      versionLabel,
    });

    let servicesHandoff = null;
    if (submission.handoff_status === "complete") {
      let drive;
      let proplaylistBytes: Buffer | undefined;
      const librarian = await loadOrgLibrarianDrive(org.orgId);
      if (librarian) {
        drive = librarian.drive;
      } else {
        const tokens = await loadTokensForCurrentSession();
        if (googleConnected(tokens)) {
          drive = getAuthedClients(tokens!).drive;
        }
      }
      if (body.proplaylistBase64?.trim()) {
        proplaylistBytes = Buffer.from(body.proplaylistBase64.trim(), "base64");
      }

      servicesHandoff = await queueServicesHandoffPublish({
        handoff: submission,
        drive,
        proplaylistBytes,
        proplaylistFileName:
          body.proplaylistFileName?.trim() ||
          nativeExportFileName(submission.commit_plan.playlistName),
        publishedBy: user.email ?? undefined,
      });

      if (servicesHandoff.packageId || servicesHandoff.driveFolderUrl) {
        const admin = createAdminClient();
        await admin
          .from("slide_deck_submissions")
          .update({
            services_package_id: servicesHandoff.packageId ?? submission.services_package_id,
            services_drive_url: servicesHandoff.driveFolderUrl ?? submission.services_drive_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", submission.id);
      }
    }

    return NextResponse.json({ ok: true, submission, servicesHandoff });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save submission.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
