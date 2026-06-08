import { NextResponse } from "next/server";
import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "@/lib/slide-deck/manifest";
import { buildMockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { loadSongLibraryIndex } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { getExistingPlaylistSummary } from "@/lib/propresenter/playlist-write";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";
import { isProPresenterUnavailableOnHosted } from "@/lib/propresenter/hosted";
import { buildPlaylistNameFromPlanDate } from "@/lib/slide-deck/playlist-name";
import {
  indexMetaFromRow,
  libraryIndexFromSnapshot,
  resolveTemplateFromSnapshot,
  templateItemsFromSnapshot,
} from "@/lib/pp-platform/cloud-index";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import { getRigById } from "@/lib/pp-platform/rigs";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { planId?: string; serviceTypeId?: string; orgId?: string };

    const plan = await loadPlanServiceOrder({
      planId: body.planId ?? "",
      serviceTypeId: body.serviceTypeId,
    });

    let propresenterConnected = false;
    let useCloudIndex = false;
    let indexMeta: { rigName: string; snapshotAt: string; stale: boolean } | undefined;
    let templateSourceFound: boolean | null = null;
    let templateSourcePlaylistId: string | undefined;
    let templateSourcePlaylistPath: string | undefined;
    let templateItems: Awaited<ReturnType<typeof getPlaylistItems>> = [];
    let libraryIndex: Awaited<ReturnType<typeof loadSongLibraryIndex>> = [];

    if (!isProPresenterUnavailableOnHosted()) {
      try {
        await ppPing(loadProPresenterConfig());
        propresenterConnected = true;

        const templateName = resolveTemplatePlaylistName();
        const found = await findPlaylistByName(templateName);
        templateSourceFound = found !== null;
        templateSourcePlaylistId = found?.id;
        templateSourcePlaylistPath = found?.path ?? found?.name;

        if (found?.id) {
          templateItems = await getPlaylistItems(found.id);
        }

        libraryIndex = await loadSongLibraryIndex();
      } catch (e) {
        if (!(e instanceof ProPresenterApiError)) {
          /* offline ok */
        }
        templateSourceFound = propresenterConnected ? false : null;
      }
    } else if (isGrapevineAuthEnabled()) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
        if (org) {
          const snapshot = await getLatestSnapshotForOrg(org.orgId);
          if (snapshot) {
            const rig = await getRigById(snapshot.rig_id);
            const meta = indexMetaFromRow(
              {
                id: snapshot.id,
                snapshot_at: snapshot.snapshot_at,
                file_count: snapshot.file_count,
                index_json: snapshot.index_json,
                rig_id: snapshot.rig_id,
              },
              rig?.display_name ?? "Presentation rig",
            );
            indexMeta = {
              rigName: meta.rigName,
              snapshotAt: meta.snapshotAt,
              stale: meta.stale,
            };
            useCloudIndex = true;
            libraryIndex = libraryIndexFromSnapshot(snapshot.index_json);
            templateItems = templateItemsFromSnapshot(snapshot.index_json);
            const template = resolveTemplateFromSnapshot(snapshot.index_json);
            templateSourceFound = template.sourceFound;
            templateSourcePlaylistId = template.sourcePlaylistId;
            templateSourcePlaylistPath = template.sourcePlaylistPath;
          }
        }
      }
    }

    const manifest = buildSlideDeckManifest({
      plan,
      templateSourceFound,
      templateSourcePlaylistId,
      templateSourcePlaylistPath,
      propresenterConnected: propresenterConnected || useCloudIndex,
      templateItems,
    });

    const targetName = buildPlaylistNameFromPlanDate(plan.dateRaw);
    const existingTarget =
      propresenterConnected && targetName
        ? await getExistingPlaylistSummary(targetName)
        : null;
    const playlistConflict =
      existingTarget?.exists && !existingTarget.empty && existingTarget.id && existingTarget.name
        ? {
            playlistId: existingTarget.id,
            playlistName: existingTarget.name,
            itemCount: existingTarget.itemCount,
          }
        : undefined;

    const commitPlan = buildMockCommitPlan({
      manifest,
      templateItems,
      libraryIndex,
      propresenterConnected: propresenterConnected || useCloudIndex,
      useCloudIndex,
      indexMeta,
      playlistConflict,
    });

    return NextResponse.json({
      ok: true,
      manifest,
      commitPlan,
      indexMeta: indexMeta ?? null,
      useCloudIndex,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build mock commit plan.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
