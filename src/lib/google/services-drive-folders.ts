import type { drive_v3 } from "@/lib/google/api-types";
import { resolveFolderByPath } from "./grg-drive-folders";
import { ensureChildFolder } from "./pp-drive-folders";

/** Services/{date}/ root for M3 complete/incomplete packages. */
export async function resolveServicesRootFolderId(drive: drive_v3.Drive): Promise<string | null> {
  const override = process.env.PP_SERVICES_FOLDER_ID?.trim();
  if (override) return override;

  const pathRaw = process.env.PP_SERVICES_FOLDER_PATH?.trim();
  if (!pathRaw) return null;

  const segments = pathRaw.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  return resolveFolderByPath(drive, segments);
}

export async function ensureServicePackageFolder(
  drive: drive_v3.Drive,
  serviceFolderKey: string,
  status: "complete" | "incomplete",
  version = 1,
): Promise<string | null> {
  const rootId = await resolveServicesRootFolderId(drive);
  if (!rootId) return null;

  const dateFolderId = await ensureChildFolder(drive, rootId, serviceFolderKey);
  const statusFolder = status === "complete" ? `complete-v${version}` : `incomplete-v${version}`;
  return ensureChildFolder(drive, dateFolderId, statusFolder);
}
