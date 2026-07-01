import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { loadSongLibraryIndex } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName, useTemplatePlaylistAssembly } from "@/lib/config/slide-deck";
import { buildSlideDeckManifest } from "./manifest";
import { buildMockCommitPlan } from "./mock-commit";
import type { MockCommitPlan } from "./mock-commit";
import type { SlideDeckManifest } from "./types";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";

export type SlideDeckApplyContext = {
  commitPlan: MockCommitPlan;
  manifest: SlideDeckManifest;
  templateItems: PpPlaylistItemRef[];
  libraryIndex: PpLibraryItemRef[];
};

export async function prepareSlideDeckApply(input: {
  planId: string;
  serviceTypeId?: string;
}): Promise<SlideDeckApplyContext> {
  const plan = await loadPlanServiceOrder({
    planId: input.planId,
    serviceTypeId: input.serviceTypeId,
  });

  const config = loadProPresenterConfig();
  await ppPing(config);

  const useTemplateAssembly = useTemplatePlaylistAssembly();
  let templateItems: PpPlaylistItemRef[] = [];
  let templateSourceFound: boolean | null = null;
  let templateSourcePlaylistId: string | undefined;
  let templateSourcePlaylistPath: string | undefined;

  if (useTemplateAssembly) {
    const templateName = resolveTemplatePlaylistName();
    const found = await findPlaylistByName(templateName);
    if (!found?.id) {
      throw new Error(`Template playlist "${templateName}" not found in ProPresenter.`);
    }
    templateSourceFound = true;
    templateSourcePlaylistId = found.id;
    templateSourcePlaylistPath = found.path ?? found.name;
    templateItems = await getPlaylistItems(found.id);
  }

  const libraryIndex = await loadSongLibraryIndex();

  const manifest = buildSlideDeckManifest({
    plan,
    templateSourceFound,
    templateSourcePlaylistId,
    templateSourcePlaylistPath,
    propresenterConnected: true,
    templateItems,
    useTemplateAssembly,
  });

  const commitPlan = buildMockCommitPlan({
    manifest,
    templateItems,
    libraryIndex,
    propresenterConnected: true,
    useTemplateAssembly,
  });

  return { commitPlan, manifest, templateItems, libraryIndex };
}

export function isProPresenterOfflineError(e: unknown): boolean {
  return e instanceof ProPresenterApiError;
}
