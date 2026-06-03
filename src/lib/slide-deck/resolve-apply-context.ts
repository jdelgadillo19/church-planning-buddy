import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { loadSongLibraryIndex } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import type { MockCommitPlan } from "./mock-commit";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";

export type ApplyContext = {
  commitPlan: MockCommitPlan;
  templateItems: PpPlaylistItemRef[];
  libraryIndex: PpLibraryItemRef[];
};

/** Load template + library index for apply using client commit plan (no PCO reload). */
export async function resolveApplyContextFromClientPlan(
  commitPlan: MockCommitPlan,
): Promise<ApplyContext> {
  const config = loadProPresenterConfig();
  await ppPing(config);

  const templateName = resolveTemplatePlaylistName();
  const found = await findPlaylistByName(templateName);
  if (!found?.id) {
    throw new Error(`Template playlist "${templateName}" not found in ProPresenter.`);
  }

  const templateItems = await getPlaylistItems(found.id);
  const libraryIndex = await loadSongLibraryIndex();

  return { commitPlan, templateItems, libraryIndex };
}

export function isProPresenterReachableError(e: unknown): boolean {
  return e instanceof ProPresenterApiError;
}
