import type { drive_v3 } from "@/lib/google/api-types";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import { buildStoreZip, sha256Hex, type ZipEntry } from "@/lib/zip/buffer-zip";
import { driveDownloadFileBytes } from "./drive-download";

export type FilebasePullManifest = {
  planId: string;
  playlistName: string;
  serviceDate: string;
  requestedPaths: string[];
  missingPaths: string[];
  fileCount: number;
  snapshotMetaPath?: string;
};

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function bundleFolderName(segment: string): string | null {
  if (!segment.toLowerCase().endsWith(".probundle")) return null;
  return segment.replace(/\.probundle$/i, "");
}

/**
 * Collect snapshot paths for a library item name — whole `.proBundle/` trees and legacy `.pro` files.
 */
export function findSnapshotPathsForSong(
  songName: string,
  snapshotFiles: Array<{ relativePath: string }>,
): string[] {
  const needle = normName(songName);
  const hits = new Set<string>();

  for (const f of snapshotFiles) {
    const rel = f.relativePath.replace(/\\/g, "/");
    if (!rel.startsWith("Libraries/")) continue;

    const parts = rel.split("/");
    for (let i = 0; i < parts.length; i++) {
      const bundleName = bundleFolderName(parts[i] ?? "");
      if (bundleName && normName(bundleName) === needle) {
        hits.add(rel);
        break;
      }
    }

    const base = parts[parts.length - 1] ?? "";
    if (base.toLowerCase().endsWith(".pro")) {
      const stem = base.replace(/\.pro$/i, "");
      if (normName(stem) === needle) hits.add(rel);
    }
  }

  return [...hits];
}

function findSnapshotPathsForTemplate(
  templatePath: string,
  snapshotFiles: Array<{ relativePath: string }>,
): string[] {
  const normalized = templatePath.replace(/\\/g, "/");
  const hits = new Set<string>();
  const fileName = normalized.split("/").pop() ?? normalized;

  for (const f of snapshotFiles) {
    const rel = f.relativePath.replace(/\\/g, "/");
    if (
      rel === normalized ||
      rel.endsWith(`/${normalized}`) ||
      rel.endsWith(`/${fileName}`) ||
      (rel.startsWith("Playlists/") && rel.split("/").pop() === fileName)
    ) {
      hits.add(rel);
    }
  }

  return [...hits];
}

/**
 * Resolve library-relative paths needed for a commit plan against a filebase snapshot index.
 */
export function resolveFilebasePathsForPlan(
  commitPlan: MockCommitPlan,
  manifest: SlideDeckManifest | null,
  cloudLibraryIndex: PpLibraryItemRef[],
  snapshotFiles: Array<{ relativePath: string; driveFileId?: string }>,
): string[] {
  const paths = new Set<string>();

  for (const row of commitPlan.playlistPreview) {
    if (row.kind !== "song_add") continue;
    const matchName = row.libraryMatch?.item?.name ?? row.name;
    const matchId = row.libraryMatch?.item?.id;
    const cloudItem =
      (matchId ? cloudLibraryIndex.find((i) => i.id === matchId) : undefined) ??
      cloudLibraryIndex.find((i) => normName(i.name) === normName(matchName));

    const label = cloudItem?.name ?? matchName;
    for (const p of findSnapshotPathsForSong(label, snapshotFiles)) {
      paths.add(p);
    }
  }

  if (manifest?.template.sourcePlaylistPath) {
    for (const p of findSnapshotPathsForTemplate(
      manifest.template.sourcePlaylistPath,
      snapshotFiles,
    )) {
      paths.add(p);
    }
  }

  return [...paths];
}

export async function buildFilebasePullZip(input: {
  drive: drive_v3.Drive;
  commitPlan: MockCommitPlan;
  manifest: SlideDeckManifest | null;
  cloudLibraryIndex: PpLibraryItemRef[];
  snapshotFiles: Array<{ relativePath: string; driveFileId: string; sha256?: string }>;
}): Promise<{ zip: Buffer; manifest: FilebasePullManifest }> {
  const requested = resolveFilebasePathsForPlan(
    input.commitPlan,
    input.manifest,
    input.cloudLibraryIndex,
    input.snapshotFiles,
  );

  const byPath = new Map(
    input.snapshotFiles.map((f) => [f.relativePath.replace(/\\/g, "/"), f]),
  );

  const entries: ZipEntry[] = [];
  const missing: string[] = [];

  for (const rel of requested) {
    const meta = byPath.get(rel);
    if (!meta?.driveFileId) {
      missing.push(rel);
      continue;
    }
    const bytes = await driveDownloadFileBytes(input.drive, meta.driveFileId);
    if (meta.sha256 && sha256Hex(bytes) !== meta.sha256) {
      missing.push(`${rel} (sha256 mismatch)`);
      continue;
    }
    entries.push({ path: rel, data: bytes });
  }

  const zip = buildStoreZip(entries);
  return {
    zip,
    manifest: {
      planId: String(input.commitPlan.planId),
      playlistName: input.commitPlan.playlistName,
      serviceDate: input.commitPlan.serviceDate ?? "",
      requestedPaths: requested,
      missingPaths: missing,
      fileCount: entries.length,
    },
  };
}
