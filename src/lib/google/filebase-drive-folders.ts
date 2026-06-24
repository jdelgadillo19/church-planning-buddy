import type { drive_v3 } from "@/lib/google/api-types";
import { resolveFolderByPath } from "./grg-drive-folders";
import { ensureChildFolder } from "./pp-drive-folders";

/** When true, Shared Drive `Filebase/` wins over legacy Computers backup root. */
export function shouldPreferSharedDriveFilebase(): boolean {
  const layout = (process.env.GV_DRIVE_LAYOUT ?? "legacy").trim().toLowerCase();
  if (layout === "dual" || layout === "v1") return true;
  if (process.env.PP_FILEBASE_FOLDER_ID?.trim()) return true;
  if (process.env.PP_FILEBASE_FOLDER_PATH?.trim()) return true;
  if (process.env.GV_DRIVE_LAYOUT_ROOT_FOLDER_ID?.trim()) return true;
  return false;
}

async function resolveSharedDriveFilebaseRoot(drive: drive_v3.Drive): Promise<string | null> {
  const override = process.env.PP_FILEBASE_FOLDER_ID?.trim();
  if (override) return override;

  const pathRaw = process.env.PP_FILEBASE_FOLDER_PATH?.trim();
  if (pathRaw) {
    const segments = pathRaw.split("/").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return null;
    return resolveFolderByPath(drive, segments);
  }

  const root = process.env.GV_DRIVE_LAYOUT_ROOT_FOLDER_ID?.trim();
  if (!root) return null;
  return ensureChildFolder(drive, root, "Filebase");
}

/** Filebase/ root on Shared Drive or Computer-backup folder (M2 / librarian). */
export async function resolveFilebaseRootFolderId(drive: drive_v3.Drive): Promise<string | null> {
  if (shouldPreferSharedDriveFilebase()) {
    const shared = await resolveSharedDriveFilebaseRoot(drive);
    if (shared) return shared;
  }

  const computerBackup = process.env.PP_COMPUTER_FILEBASE_FOLDER_ID?.trim();
  if (computerBackup) return computerBackup;

  return resolveSharedDriveFilebaseRoot(drive);
}

export async function resolveFilebaseSnapshotsFolderId(
  drive: drive_v3.Drive,
): Promise<string | null> {
  const rootId = await resolveFilebaseRootFolderId(drive);
  if (!rootId) return null;
  return ensureChildFolder(drive, rootId, "snapshots");
}
