import type { BundleSnapshot } from "@/lib/propresenter/bundle-sync/types";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function libraryIndexFromSnapshot(snapshot: BundleSnapshot): PpLibraryItemRef[] {
  return snapshot.libraryIndex ?? [];
}

export function templateItemsFromSnapshot(snapshot: BundleSnapshot): PpPlaylistItemRef[] {
  return snapshot.templateItems ?? [];
}

export function resolveTemplateFromSnapshot(snapshot: BundleSnapshot): {
  sourceFound: boolean;
  sourcePlaylistId?: string;
  sourcePlaylistPath?: string;
  itemCount: number;
} {
  const templateName = resolveTemplatePlaylistName();
  const fromList = snapshot.templatePlaylists?.find(
    (p) => p.name.toLowerCase() === templateName.toLowerCase(),
  );
  if (fromList) {
    return {
      sourceFound: true,
      sourcePlaylistId: fromList.id,
      sourcePlaylistPath: fromList.name,
      itemCount: fromList.itemCount,
    };
  }

  const fileMatch = snapshot.files.find((f) => {
    const base = f.relativePath.split("/").pop() ?? "";
    const stem = base.replace(/\.proplaylist$/i, "");
    return stem.toLowerCase() === templateName.toLowerCase();
  });
  if (fileMatch) {
    return {
      sourceFound: true,
      sourcePlaylistPath: fileMatch.relativePath,
      itemCount: 0,
    };
  }

  return { sourceFound: false, itemCount: 0 };
}

export function isSnapshotStale(snapshotAt: string): boolean {
  const at = Date.parse(snapshotAt);
  if (!Number.isFinite(at)) return true;
  return Date.now() - at > STALE_MS;
}

export function indexMetaFromRow(
  row: {
    id: string;
    snapshot_at: string;
    file_count: number;
    index_json: BundleSnapshot;
    rig_id: string;
  },
  rigName: string,
): {
  snapshotId: string;
  snapshotAt: string;
  rigId: string;
  rigName: string;
  fileCount: number;
  libraryItemCount: number;
  stale: boolean;
  hasLibraryIndex: boolean;
} {
  const indexJson = row.index_json;
  const libraryItemCount = libraryIndexFromSnapshot(indexJson).length;
  return {
    snapshotId: row.id,
    snapshotAt: row.snapshot_at,
    rigId: row.rig_id,
    rigName,
    fileCount: row.file_count,
    libraryItemCount,
    stale: isSnapshotStale(row.snapshot_at),
    hasLibraryIndex: libraryItemCount > 0,
  };
}
