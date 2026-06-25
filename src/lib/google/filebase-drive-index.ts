import type { drive_v3 } from "@/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "./drive-files";
import type { EnvSource } from "@/lib/config/worker-env";
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

type ListCorpora = "user" | "allDrives" | "auto";

async function listChildren(
  drive: drive_v3.Drive,
  parentId: string,
  corpora: ListCorpora = "auto",
): Promise<DriveChild[]> {
  const tryCorpora: Array<"user" | "allDrives"> =
    corpora === "auto" ? ["user", "allDrives"] : [corpora];

  for (const corpus of tryCorpora) {
    const escaped = parentId.replaceAll("'", "\\'");
    const out: DriveChild[] = [];
    let pageToken: string | undefined;

    do {
      const list = await drive.files.list({
        q: `'${escaped}' in parents and trashed=false`,
        fields: "nextPageToken, files(id, name, mimeType, size)",
        pageSize: 1000,
        corpora: corpus,
        ...SHARED_DRIVE_OPTS,
        pageToken,
      });
      out.push(...(list.data.files ?? []));
      pageToken = list.data.nextPageToken ?? undefined;
    } while (pageToken);

    if (out.length > 0) return out;
  }

  return [];
}

async function walkFolder(
  drive: drive_v3.Drive,
  parentId: string,
  prefix: string,
  out: FilebaseDriveIndexFile[],
  corpora: ListCorpora,
  maxFiles: number,
): Promise<void> {
  if (out.length >= maxFiles) return;
  const children = await listChildren(drive, parentId, corpora);
  for (const child of children) {
    if (out.length >= maxFiles) return;
    if (!child.id || !child.name) continue;
    const rel = `${prefix}/${child.name}`.replace(/\\/g, "/");
    if (child.mimeType === FOLDER_MIME) {
      await walkFolder(drive, child.id, rel, out, corpora, maxFiles);
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
  options?: { listCorpora?: ListCorpora; maxFiles?: number },
): Promise<FilebaseDriveIndexFile[]> {
  const corpora = options?.listCorpora ?? "auto";
  const maxFiles = options?.maxFiles ?? 20_000;
  const out: FilebaseDriveIndexFile[] = [];
  const top = await listChildren(drive, filebaseRootId, corpora);

  for (const child of top) {
    if (out.length >= maxFiles) break;
    if (!child.id || !child.name) continue;
    if (child.name.toLowerCase() === "snapshots") continue;

    if (child.mimeType === FOLDER_MIME) {
      await walkFolder(drive, child.id, child.name, out, corpora, maxFiles);
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

/** Strip Computers-backup prefixes so paths match `Libraries/…` layout. */
export function normalizeFilebaseRelativePath(relativePath: string): string {
  let p = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const lower = p.toLowerCase();
  if (lower.startsWith("propresenter/")) {
    p = p.slice("propresenter/".length);
  }
  return p;
}

export function normalizeFilebaseDriveIndex(index: FilebaseDriveIndex): FilebaseDriveIndex {
  return {
    ...index,
    files: index.files.map((f) => ({
      ...f,
      relativePath: normalizeFilebaseRelativePath(f.relativePath),
    })),
  };
}

/**
 * Load filebase file index: prefer `Filebase/snapshots/*.json`, else walk live Drive tree.
 */
export async function loadFilebaseDriveFileIndex(
  drive: drive_v3.Drive,
  filebaseRootId: string,
  options?: { walkOnly?: boolean; env?: EnvSource; listCorpora?: ListCorpora; maxFiles?: number },
): Promise<FilebaseDriveIndex | null> {
  const env = options?.env ?? (process.env as EnvSource);
  if (!options?.walkOnly) {
    const snapshot = await loadLatestFilebaseDriveSnapshot(drive, env);
    if (snapshot && snapshot.files.length > 0) {
      return {
        files: snapshot.files.map((f) => ({
          ...f,
          relativePath: normalizeFilebaseRelativePath(f.relativePath),
        })),
        source: "snapshot",
        snapshotMetaPath: snapshot.driveMetaPath,
      };
    }
  }

  const walked = await walkFilebaseDriveTree(drive, filebaseRootId, {
    listCorpora: options?.listCorpora,
    maxFiles: options?.maxFiles,
  });
  if (walked.length === 0) return null;

  return {
    files: walked.map((f) => ({
      ...f,
      relativePath: normalizeFilebaseRelativePath(f.relativePath),
    })),
    source: "walk",
  };
}
