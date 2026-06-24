import type { drive_v3 } from "@/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "./drive-files";
import { driveDownloadFileBytes } from "./drive-download";
import { resolveFilebaseSnapshotsFolderId } from "./filebase-drive-folders";

export type FilebaseDriveSnapshotFile = {
  relativePath: string;
  driveFileId: string;
  sha256?: string;
  size?: number;
};

export type FilebaseDriveSnapshot = {
  snapshotId: string;
  createdAt: string;
  driveFileId: string;
  driveMetaPath: string;
  files: FilebaseDriveSnapshotFile[];
};

type SnapshotManifestJson = {
  snapshotId?: string;
  createdAt?: string;
  files?: Array<{
    relativePath?: string;
    driveFileId?: string;
    sha256?: string;
    size?: number;
  }>;
};

function parseSnapshotManifest(
  raw: string,
  driveFileId: string,
  fileName: string,
): FilebaseDriveSnapshot {
  const data = JSON.parse(raw) as SnapshotManifestJson;
  const files: FilebaseDriveSnapshotFile[] = [];
  for (const row of data.files ?? []) {
    const relativePath = row.relativePath?.replace(/\\/g, "/").trim();
    const id = row.driveFileId?.trim();
    if (!relativePath || !id) continue;
    files.push({
      relativePath,
      driveFileId: id,
      sha256: row.sha256,
      size: row.size,
    });
  }

  const snapshotId = data.snapshotId?.trim() || fileName.replace(/\.json$/i, "");
  const createdAt = data.createdAt?.trim() || new Date(0).toISOString();

  return {
    snapshotId,
    createdAt,
    driveFileId,
    driveMetaPath: `Filebase/snapshots/${fileName}`,
    files,
  };
}

/**
 * Load the newest Filebase snapshot manifest from GDrive `Filebase/snapshots/`.
 * Written by `npm run filebase:seed-upload` (M2).
 */
export async function loadLatestFilebaseDriveSnapshot(
  drive: drive_v3.Drive,
): Promise<FilebaseDriveSnapshot | null> {
  const snapshotsFolderId = await resolveFilebaseSnapshotsFolderId(drive);
  if (!snapshotsFolderId) return null;

  const list = await drive.files.list({
    q: `'${snapshotsFolderId.replaceAll("'", "\\'")}' in parents and trashed=false`,
    fields: "files(id,name,modifiedTime,mimeType)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
    corpora: "allDrives",
    ...SHARED_DRIVE_OPTS,
  });

  const candidates = (list.data.files ?? []).filter(
    (f) => f.id && f.name?.toLowerCase().endsWith(".json"),
  );
  if (candidates.length === 0) return null;

  let best: FilebaseDriveSnapshot | null = null;

  for (const file of candidates) {
    if (!file.id || !file.name) continue;
    try {
      const bytes = await driveDownloadFileBytes(drive, file.id);
      const parsed = parseSnapshotManifest(bytes.toString("utf8"), file.id, file.name);
      if (parsed.files.length === 0) continue;
      if (
        !best ||
        Date.parse(parsed.createdAt) > Date.parse(best.createdAt) ||
        (parsed.createdAt === best.createdAt && parsed.files.length > best.files.length)
      ) {
        best = parsed;
      }
    } catch {
      continue;
    }
  }

  return best;
}
