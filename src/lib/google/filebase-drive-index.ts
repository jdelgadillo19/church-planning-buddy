import type { drive_v3 } from "@/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "./drive-files";
import {
  loadLatestFilebaseDriveSnapshot,
  type FilebaseDriveSnapshotFile,
} from "./filebase-drive-snapshot";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export type FilebaseDriveIndexFile = FilebaseDriveSnapshotFile;

export type FilebaseDriveIndex = {
  files: FilebaseDriveIndexFile[];
  source: "snapshot" | "walk";
  snapshotMetaPath?: string;
};

type DriveChild = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
};

async function listChildren(drive: drive_v3.Drive, parentId: string): Promise<DriveChild[]> {
  const escaped = parentId.replaceAll("'", "\\'");
  const out: DriveChild[] = [];
  let pageToken: string | undefined;

  do {
    const list = await drive.files.list({
      q: `'${escaped}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: 1000,
      corpora: "allDrives",
      ...SHARED_DRIVE_OPTS,
      pageToken,
    });
    out.push(...(list.data.files ?? []));
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}

async function walkFolder(
  drive: drive_v3.Drive,
  parentId: string,
  prefix: string,
  out: FilebaseDriveIndexFile[],
): Promise<void> {
  const children = await listChildren(drive, parentId);
  for (const child of children) {
    if (!child.id || !child.name) continue;
    const rel = `${prefix}/${child.name}`.replace(/\\/g, "/");
    if (child.mimeType === FOLDER_MIME) {
      await walkFolder(drive, child.id, rel, out);
    } else {
      out.push({
        relativePath: rel,
        driveFileId: child.id,
        size: child.size ? Number.parseInt(child.size, 10) : undefined,
      });
    }
  }
}

/**
 * Walk `Filebase/Libraries/` and `Filebase/Playlists/` on Drive when no snapshot JSON exists.
 */
export async function walkFilebaseDriveTree(
  drive: drive_v3.Drive,
  filebaseRootId: string,
): Promise<FilebaseDriveIndexFile[]> {
  const out: FilebaseDriveIndexFile[] = [];
  const top = await listChildren(drive, filebaseRootId);

  for (const child of top) {
    if (!child.id || !child.name) continue;
    if (child.name.toLowerCase() === "snapshots") continue;

    if (child.mimeType === FOLDER_MIME) {
      await walkFolder(drive, child.id, child.name, out);
    } else {
      out.push({
        relativePath: child.name.replace(/\\/g, "/"),
        driveFileId: child.id,
        size: child.size ? Number.parseInt(child.size, 10) : undefined,
      });
    }
  }

  return out;
}

/**
 * Load filebase file index: prefer `Filebase/snapshots/*.json`, else walk live Drive tree.
 */
export async function loadFilebaseDriveFileIndex(
  drive: drive_v3.Drive,
  filebaseRootId: string,
): Promise<FilebaseDriveIndex | null> {
  const snapshot = await loadLatestFilebaseDriveSnapshot(drive);
  if (snapshot && snapshot.files.length > 0) {
    return {
      files: snapshot.files,
      source: "snapshot",
      snapshotMetaPath: snapshot.driveMetaPath,
    };
  }

  const walked = await walkFilebaseDriveTree(drive, filebaseRootId);
  if (walked.length === 0) return null;

  return { files: walked, source: "walk" };
}
