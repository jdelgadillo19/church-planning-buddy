import { NextResponse } from "next/server";
import { buildFilebasePullZip } from "@/lib/google/filebase-pull";
import { stageFilebasePullZip } from "@/lib/google/filebase-pull-store";
import { loadFilebaseDriveFileIndex } from "@/lib/google/filebase-drive-index";
import { resolveFilebaseRootFolderId } from "@/lib/google/filebase-drive-folders";
import { loadOrgLibrarianDrive } from "@/lib/google/org-librarian-drive";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import { libraryIndexFromSnapshot } from "@/lib/pp-platform/cloud-index";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "@/lib/slide-deck/manifest";
import { buildMockCommitPlan } from "@/lib/slide-deck/mock-commit";

/** POST — selective filebase zip for remote prep (M4). */
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
    };

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }

    const planId = body.planId?.trim() ?? "";
    if (!planId) {
      return NextResponse.json({ ok: false, error: "planId is required." }, { status: 400 });
    }

    const librarian = await loadOrgLibrarianDrive(org.orgId);
    if (!librarian) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "File librarian not configured. Owner must connect Google (set PP_LIBRARIAN_USER_ID).",
        },
        { status: 401 },
      );
    }

    const snapshot = await getLatestSnapshotForOrg(org.orgId);
    if (!snapshot?.index_json) {
      return NextResponse.json(
        { ok: false, error: "No library index snapshot — run Scan now on the presentation rig." },
        { status: 400 },
      );
    }

    const plan = await loadPlanServiceOrder({
      planId,
      serviceTypeId: body.serviceTypeId,
    });
    const manifest = buildSlideDeckManifest({ plan });
    const cloudLibrary = libraryIndexFromSnapshot(snapshot.index_json);

    const commitPlan = buildMockCommitPlan({
      manifest,
      templateItems: [],
      libraryIndex: cloudLibrary,
      propresenterConnected: false,
      useCloudIndex: true,
    });

    const { drive } = librarian;

    const filebaseRoot = await resolveFilebaseRootFolderId(drive);
    if (!filebaseRoot) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Filebase folder not configured. Set GV_DRIVE_LAYOUT_ROOT_FOLDER_ID + Filebase path or PP_FILEBASE_FOLDER_ID.",
        },
        { status: 400 },
      );
    }

    const driveIndex = await loadFilebaseDriveFileIndex(drive, filebaseRoot);
    if (!driveIndex || driveIndex.files.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No files found under Filebase/ on Google Drive.",
        },
        { status: 400 },
      );
    }

    const driveFileIndex = driveIndex.files;

    const { zip, manifest: pullManifest } = await buildFilebasePullZip({
      drive,
      commitPlan,
      manifest,
      cloudLibraryIndex: cloudLibrary,
      snapshotFiles: driveFileIndex,
    });

    if (driveIndex.snapshotMetaPath) {
      pullManifest.snapshotMetaPath = driveIndex.snapshotMetaPath;
    }

    if (pullManifest.requestedPaths.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No filebase files matched this plan. Confirm songs exist in Filebase/Libraries/ and rig Scan is current.",
        },
        { status: 400 },
      );
    }

    if (pullManifest.missingPaths.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Filebase pull incomplete — missing: ${pullManifest.missingPaths.slice(0, 8).join(", ")}${
            pullManifest.missingPaths.length > 8 ? "…" : ""
          }`,
          missingPaths: pullManifest.missingPaths,
        },
        { status: 400 },
      );
    }

    if (pullManifest.fileCount === 0) {
      return NextResponse.json(
        { ok: false, error: "Filebase pull produced an empty zip." },
        { status: 400 },
      );
    }

    const fileName = `filebase-pull-${planId}-${Date.now()}.zip`;
    const staged = await stageFilebasePullZip({
      orgId: org.orgId,
      userId: user.id,
      planId,
      fileName,
      zip,
    });

    if (staged) {
      return NextResponse.json(
        {
          ok: true,
          fileName,
          downloadUrl: staged.downloadUrl,
          pullId: staged.pullId,
          manifest: pullManifest,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-transform",
            "Content-Type": "application/json; charset=utf-8",
          },
        },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not stage file download on the server. Try again in a moment or contact your admin.",
      },
      { status: 503 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Filebase pull failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
