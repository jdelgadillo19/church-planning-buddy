import { NextResponse } from "next/server";
import { buildFilebasePullZip } from "@/lib/google/filebase-pull";
import { driveListFilesFetch, resolveGoogleAccessToken } from "@/lib/google/drive-fetch";
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
    const accessToken = await resolveGoogleAccessToken(librarian.tokens);
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Librarian Google token unavailable." }, { status: 401 });
    }

    const filebaseRoot = await resolveFilebaseRootFolderId(drive);
    if (!filebaseRoot) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Computer filebase folder not configured. Set PP_COMPUTER_FILEBASE_FOLDER_ID in env.",
        },
        { status: 400 },
      );
    }

    const snapshotMetaPath = `Filebase/snapshots/${snapshot.id}.json`;
    const indexFiles = snapshot.index_json.files ?? [];
    const driveFileIndex: Array<{ relativePath: string; driveFileId: string }> = [];

    for (const file of indexFiles) {
      const rel = file.relativePath.replace(/\\/g, "/");
      const escaped = rel.split("/").pop()!.replaceAll("'", "\\'");
      const q = `'${filebaseRoot}' in parents and name = '${escaped}' and trashed=false`;
      const listed = await driveListFilesFetch(accessToken, { q, pageSize: 5 });
      const hit = listed.files[0];
      if (hit?.id) {
        driveFileIndex.push({ relativePath: rel, driveFileId: hit.id });
      }
    }

    if (driveFileIndex.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Filebase/ is empty or not seeded. Run npm run filebase:seed-upload on the presentation rig.",
        },
        { status: 400 },
      );
    }

    const { zip, manifest: pullManifest } = await buildFilebasePullZip({
      drive,
      commitPlan,
      manifest,
      cloudLibraryIndex: cloudLibrary,
      snapshotFiles: driveFileIndex,
    });

    const fileName = `filebase-pull-${planId}-${Date.now()}.zip`;
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${fileName}"`,
        "x-cpb-pull-manifest": JSON.stringify({ ...pullManifest, snapshotMetaPath }),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Filebase pull failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
