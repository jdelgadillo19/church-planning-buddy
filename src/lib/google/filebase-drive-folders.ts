import type { drive_v3 } from "@/lib/google/api-types";
import { resolveFolderByPath } from "./grg-drive-folders";
import { ensureChildFolder } from "./pp-drive-folders";

/** Filebase/ root on Shared Drive or Computer-backup folder (M2 / librarian). */
export async function resolveFilebaseRootFolderId(drive: drive_v3.Drive): Promise<string | null> {
  const computerBackup = process.env.PP_COMPUTER_FILEBASE_FOLDER_ID?.trim();
  if (computerBackup) return computerBackup;

  const override = process.env.PP_FILEBASE_FOLDER_ID?.trim();
  if (override) return override;

  const pathRaw = process.env.PP_FILEBASE_FOLDER_PATH?.trim();
  if (!pathRaw) {
    const root = process.env.GV_DRIVE_LAYOUT_ROOT_FOLDER_ID?.trim();
    if (!root) return null;
    return ensureChildFolder(drive, root, "Filebase");
  }

  const segments = pathRaw.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  return resolveFolderByPath(drive, segments);
}

export async function resolveFilebaseSnapshotsFolderId(
  drive: drive_v3.Drive,
): Promise<string | null> {
  const rootId = await resolveFilebaseRootFolderId(drive);
  if (!rootId) return null;
  return ensureChildFolder(drive, rootId, "snapshots");
}
