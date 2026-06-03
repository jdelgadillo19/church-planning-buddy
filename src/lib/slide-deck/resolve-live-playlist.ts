import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import type { ApplyCommitResult } from "./apply-commit";
import type { MockCommitPlaylistRow } from "./mock-commit";

export type LivePlaylistSnapshot = {
  playlistId: string;
  playlistName: string;
  itemCount: number;
  items: { position: number; name: string }[];
};

/** Read existing ProPresenter playlist by name; null if missing or empty. */
export async function readLivePlaylistByName(
  playlistName: string,
): Promise<LivePlaylistSnapshot | null> {
  try {
    await ppPing(loadProPresenterConfig());
  } catch (e) {
    if (e instanceof ProPresenterApiError) return null;
    throw e;
  }

  const found = await findPlaylistByName(playlistName);
  if (!found?.id) return null;

  const items = await getPlaylistItems(found.id);
  if (items.length === 0) return null;

  return {
    playlistId: found.id,
    playlistName: found.name,
    itemCount: items.length,
    items: items.map((item, index) => ({
      position: index + 1,
      name: item.name,
    })),
  };
}

export function applyResultFromLiveSnapshot(
  snapshot: LivePlaylistSnapshot,
  commitPlanPreview?: MockCommitPlaylistRow[],
): ApplyCommitResult {
  return {
    ok: true,
    playlistId: snapshot.playlistId,
    playlistName: snapshot.playlistName,
    itemCount: snapshot.itemCount,
    items: snapshot.items.map((item, index) => ({
      position: item.position,
      name: item.name,
      kind: commitPlanPreview?.[index]?.kind ?? "song_add",
    })),
    warnings: [],
  };
}
