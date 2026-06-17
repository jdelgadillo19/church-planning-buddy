import { NextResponse } from "next/server";
import { guardProPresenterOnHosted } from "@/lib/propresenter/hosted-guard";
import { loadSongLibraryIndex } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import { libraryIndexFromSnapshot } from "@/lib/pp-platform/cloud-index";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { buildMockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "@/lib/slide-deck/manifest";
import { missingFilebaseAssets } from "@/lib/slide-deck/missing-filebase-assets";

export async function POST(req: Request) {
  const hostedBlock = guardProPresenterOnHosted();
  if (hostedBlock) return hostedBlock;

  try {
    const body = (await req.json()) as {
      planId?: string;
      serviceTypeId?: string;
      orgId?: string;
      playlistId?: string;
    };

    const planId = body.planId?.trim() ?? "";
    if (!planId) {
      return NextResponse.json({ ok: false, error: "planId is required." }, { status: 400 });
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

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }

    const plan = await loadPlanServiceOrder({
      planId,
      serviceTypeId: body.serviceTypeId,
    });
    const manifest = buildSlideDeckManifest({ plan });
    const localLibrary = await loadSongLibraryIndex();

    let cloudLibrary = localLibrary;
    const snapshot = await getLatestSnapshotForOrg(org.orgId);
    if (snapshot?.index_json) {
      cloudLibrary = libraryIndexFromSnapshot(snapshot.index_json);
    }

    const commitPlan = buildMockCommitPlan({
      manifest,
      templateItems: [],
      libraryIndex: cloudLibrary,
      propresenterConnected: true,
      useCloudIndex: Boolean(snapshot),
    });

    if (body.playlistId?.trim()) {
      const items = await getPlaylistItems(body.playlistId.trim());
      commitPlan.playlistPreview = commitPlan.playlistPreview.map((row, idx) => {
        const actual = items[idx];
        if (!actual) return row;
        if (row.kind !== "song_add") return { ...row, name: actual.name };
        return { ...row, name: actual.name };
      });
    }

    const missingFiles = missingFilebaseAssets(commitPlan, localLibrary, cloudLibrary);

    return NextResponse.json({
      ok: true,
      missingFiles,
      localLibraryCount: localLibrary.length,
      cloudLibraryCount: cloudLibrary.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Missing filebase scan failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
