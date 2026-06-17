import type { drive_v3 } from "@/lib/google/api-types";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import { buildStoreZip, type ZipEntry } from "@/lib/zip/buffer-zip";
import { driveDownloadFileBytes } from "./drive-download";

export type FilebasePullManifest = {
  planId: string;
  playlistName: string;
  serviceDate: string;
  requestedPaths: string[];
  missingPaths: string[];
  fileCount: number;
};

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function findSnapshotPathsForSong(
  songName: string,
  snapshotFiles: Array<{ relativePath: string }>,
): string[] {
  const needle = normName(songName);
  const hits: string[] = [];
  for (const f of snapshotFiles) {
    const rel = f.relativePath.replace(/\\/g, "/");
    if (!rel.startsWith("Libraries/")) continue;
    const base = rel.split("/").pop() ?? "";
    const stem = base.replace(/\.[^.]+$/, "");
    if (normName(stem) === needle || normName(base) === needle) {
      hits.push(rel);
    }
  }
  return hits;
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
    const templatePath = manifest.template.sourcePlaylistPath.replace(/\\/g, "/");
    const snapshotPaths = snapshotFiles.map((f) => f.relativePath.replace(/\\/g, "/"));
    const exact = snapshotPaths.find(
      (p) => p === templatePath || p.endsWith(`/${templatePath}`) || p.includes(templatePath),
    );
    if (exact) paths.add(exact);
  }

  return [...paths];
}

export async function buildFilebasePullZip(input: {
  drive: drive_v3.Drive;
  commitPlan: MockCommitPlan;
  manifest: SlideDeckManifest | null;
  cloudLibraryIndex: PpLibraryItemRef[];
  snapshotFiles: Array<{ relativePath: string; driveFileId: string }>;
}): Promise<{ zip: Buffer; manifest: FilebasePullManifest }> {
  const requested = resolveFilebasePathsForPlan(
    input.commitPlan,
    input.manifest,
    input.cloudLibraryIndex,
    input.snapshotFiles,
  );

  const byPath = new Map(
    input.snapshotFiles.map((f) => [f.relativePath.replace(/\\/g, "/"), f.driveFileId]),
  );

  const entries: ZipEntry[] = [];
  const missing: string[] = [];

  for (const rel of requested) {
    const fileId = byPath.get(rel);
    if (!fileId) {
      missing.push(rel);
      continue;
    }
    const bytes = await driveDownloadFileBytes(input.drive, fileId);
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
