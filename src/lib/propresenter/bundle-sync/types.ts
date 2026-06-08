import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";

/** Read-only file record from bundle scanner. */
export type BundleFileRecord = {
  relativePath: string;
  size: number;
  mtimeMs: number;
  sha256?: string;
};

/** Template playlist summary from index scan. */
export type BundleTemplatePlaylist = {
  name: string;
  id?: string;
  itemCount: number;
};

/**
 * Immutable snapshot of ProPresenter Support Files tree.
 * schemaVersion 1 — see docs/planning/SLIDE-DECK-PHASE-0-SPEC.md
 */
export type BundleSnapshot = {
  schemaVersion: 1;
  createdAt: string;
  bundleRoot: string;
  deviceLabel: string;
  files: BundleFileRecord[];
  /** Populated when PP Local API is available during scan. */
  libraryIndex?: PpLibraryItemRef[];
  templatePlaylists?: BundleTemplatePlaylist[];
  /** Template playlist items when PP API read during upload. */
  templateItems?: PpPlaylistItemRef[];
};

export type BundleScanResult = {
  snapshot: BundleSnapshot;
  warnings: string[];
  skippedPaths: number;
};
