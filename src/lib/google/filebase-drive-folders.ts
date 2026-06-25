import type { drive_v3 } from "@/lib/google/api-types";
import { envString, type EnvSource } from "@/lib/config/worker-env";
import type { FilebaseDriveIndex } from "./filebase-drive-index";
import { loadFilebaseDriveFileIndex, normalizeFilebaseDriveIndex } from "./filebase-drive-index";
import { resolveFolderByPath } from "./grg-drive-folders";
import { ensureChildFolder } from "./pp-drive-folders";

/** When true, Shared Drive `Filebase/` is tried before legacy Computers backup. */
export function shouldPreferSharedDriveFilebase(env: EnvSource = process.env as EnvSource): boolean {
  const layout = (envString(env, "GV_DRIVE_LAYOUT") ?? "legacy").toLowerCase();
  if (layout === "dual" || layout === "v1") return true;
  if (envString(env, "PP_FILEBASE_FOLDER_ID")) return true;
  if (envString(env, "PP_FILEBASE_FOLDER_PATH")) return true;
  if (envString(env, "GV_DRIVE_LAYOUT_ROOT_FOLDER_ID")) return true;
  return false;
}

export function hasFilebaseDriveConfig(env: EnvSource = process.env as EnvSource): boolean {
  return Boolean(
    envString(env, "PP_FILEBASE_FOLDER_ID") ||
      envString(env, "PP_FILEBASE_FOLDER_PATH") ||
      envString(env, "GV_DRIVE_LAYOUT_ROOT_FOLDER_ID") ||
      envString(env, "PP_COMPUTER_FILEBASE_FOLDER_ID"),
  );
}

async function resolveSharedDriveFilebaseRoot(
  drive: drive_v3.Drive,
  env: EnvSource,
): Promise<string | null> {
  const override = envString(env, "PP_FILEBASE_FOLDER_ID");
  if (override) return override;

  const pathRaw = envString(env, "PP_FILEBASE_FOLDER_PATH");
  if (pathRaw) {
    const segments = pathRaw.split("/").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return null;
    return resolveFolderByPath(drive, segments);
  }

  const root = envString(env, "GV_DRIVE_LAYOUT_ROOT_FOLDER_ID");
  if (!root) return null;
  return ensureChildFolder(drive, root, "Filebase");
}

/** Filebase/ root on Shared Drive or Computer-backup folder (M2 / librarian). */
export async function resolveFilebaseRootFolderId(
  drive: drive_v3.Drive,
  env: EnvSource = process.env as EnvSource,
): Promise<string | null> {
  if (shouldPreferSharedDriveFilebase(env)) {
    const shared = await resolveSharedDriveFilebaseRoot(drive, env);
    if (shared) return shared;
  }

  const computerBackup = envString(env, "PP_COMPUTER_FILEBASE_FOLDER_ID");
  if (computerBackup) return computerBackup;

  return resolveSharedDriveFilebaseRoot(drive, env);
}

export async function resolveFilebaseSnapshotsFolderId(
  drive: drive_v3.Drive,
  env: EnvSource = process.env as EnvSource,
): Promise<string | null> {
  const rootId = await resolveFilebaseRootFolderId(drive, env);
  if (!rootId) return null;
  return ensureChildFolder(drive, rootId, "snapshots");
}

/**
 * Resolve a Drive tree with files for M4 pull — Shared Drive `Filebase/` first, then
 * legacy Computers backup when shared is empty (interim until M2 seed completes).
 */
export async function resolveFilebasePullSource(
  drive: drive_v3.Drive,
  env: EnvSource = process.env as EnvSource,
): Promise<{ rootId: string; index: FilebaseDriveIndex; source: "shared" | "computer" } | null> {
  const candidates: Array<{ rootId: string; source: "shared" | "computer"; walkOnly: boolean }> =
    [];

  const shared = await resolveSharedDriveFilebaseRoot(drive, env);
  if (shared) {
    candidates.push({ rootId: shared, source: "shared", walkOnly: false });
  }

  const computer = envString(env, "PP_COMPUTER_FILEBASE_FOLDER_ID");
  if (computer && computer !== shared) {
    candidates.push({ rootId: computer, source: "computer", walkOnly: true });
  }

  for (const candidate of candidates) {
    const index = await loadFilebaseDriveFileIndex(drive, candidate.rootId, {
      walkOnly: candidate.walkOnly,
    });
    if (index && index.files.length > 0) {
      return {
        rootId: candidate.rootId,
        index: normalizeFilebaseDriveIndex(index),
        source: candidate.source,
      };
    }
  }

  return null;
}
