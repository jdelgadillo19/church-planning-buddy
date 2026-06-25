import type { drive_v3 } from "@/lib/google/api-types";
import { resolvePpDriveFolderRefs } from "@/lib/config/pp-drive";
import { resolveFolderByPath, listMatchingFolders } from "./grg-drive-folders";
import { SHARED_DRIVE_OPTS } from "./drive-files";

export async function resolvePpPlaylistsFolderId(drive: drive_v3.Drive): Promise<string> {
  const refs = resolvePpDriveFolderRefs();
  if (refs.playlistsFolderId) return refs.playlistsFolderId;

  const id = await resolveFolderByPath(drive, refs.playlistsPath);
  if (!id) {
    throw new Error(
      `ProPresenter Playlists folder not found at "${refs.playlistsPath.join("/")}". ` +
        "Create it on Drive or set PP_PLAYLISTS_FOLDER_ID.",
    );
  }
  return id;
}

export async function resolvePpNewFilesFolderId(drive: drive_v3.Drive): Promise<string> {
  const refs = resolvePpDriveFolderRefs();
  if (refs.newFilesFolderId) return refs.newFilesFolderId;

  const id = await resolveFolderByPath(drive, refs.newFilesPath);
  if (!id) {
    throw new Error(
      `ProPresenter New Files folder not found at "${refs.newFilesPath.join("/")}". ` +
        "Create it on Drive or set PP_NEW_FILES_FOLDER_ID.",
    );
  }
  return id;
}

/** Find a child folder by exact name; returns null if missing (read-only). */
export async function findChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | null> {
  const matches = await listMatchingFolders(drive, name, parentId);
  return matches[0]?.id ?? null;
}

/** Find or create a child folder by exact name under parent. */
export async function ensureChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const matches = await listMatchingFolders(drive, name, parentId);
  if (matches[0]?.id) return matches[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    ...SHARED_DRIVE_OPTS,
  });

  const id = created.data.id;
  if (!id) throw new Error(`Failed to create Drive folder "${name}".`);
  return id;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
