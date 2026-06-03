import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "./manifest";
import { buildMockCommitPlan, type MockCommitPlan } from "./mock-commit";
import type { SlideDeckManifest } from "./types";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { loadSongLibraryIndex } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";
import type { ApplyCommitResult } from "./apply-commit";

export type SlideDeckBundle = {
  manifest: SlideDeckManifest;
  commitPlan: MockCommitPlan;
  applyResult?: ApplyCommitResult;
};

export type LoadSlideDeckBundleInput = {
  planId: string;
  serviceTypeId?: string;
  applyResult?: ApplyCommitResult;
};

/** Build manifest + mock commit plan (same inputs as mock-commit API). */
export async function loadSlideDeckBundle(
  input: LoadSlideDeckBundleInput,
): Promise<SlideDeckBundle> {
  const plan = await loadPlanServiceOrder({
    planId: input.planId,
    serviceTypeId: input.serviceTypeId,
  });

  let propresenterConnected = false;
  let templateSourceFound: boolean | null = null;
  let templateSourcePlaylistId: string | undefined;
  let templateSourcePlaylistPath: string | undefined;
  let templateItems: Awaited<ReturnType<typeof getPlaylistItems>> = [];
  let libraryIndex: Awaited<ReturnType<typeof loadSongLibraryIndex>> = [];

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
      /* offline ok for publish */
    }
    templateSourceFound = propresenterConnected ? false : null;
  }

  const manifest = buildSlideDeckManifest({
    plan,
    templateSourceFound,
    templateSourcePlaylistId,
    templateSourcePlaylistPath,
    propresenterConnected,
    templateItems,
  });

  const commitPlan = buildMockCommitPlan({
    manifest,
    templateItems,
    libraryIndex,
    propresenterConnected,
  });

  return { manifest, commitPlan, applyResult: input.applyResult };
}
