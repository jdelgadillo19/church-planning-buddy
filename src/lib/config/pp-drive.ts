/** Drive layout under personal `church-planning-buddy` root (see docs/PROPRESENTER-PUBLISH.md). */

export const DEFAULT_PP_DRIVE_ROOT = "church-planning-buddy";
export const DEFAULT_PP_PRESENTATIONS_FOLDER = "ProPresenter";
export const DEFAULT_PP_PLAYLISTS_FOLDER = "Playlists";
export const DEFAULT_PP_NEW_FILES_FOLDER = "New Files";

export type PpDriveFolderRefs = {
  playlistsFolderId?: string;
  newFilesFolderId?: string;
  playlistsPath: string[];
  newFilesPath: string[];
};

function splitPath(raw: string | undefined): string[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultProPresenterPath(): string[] {
  const root = process.env.PP_DRIVE_ROOT?.trim() || DEFAULT_PP_DRIVE_ROOT;
  const pp = process.env.PP_PRESENTATIONS_FOLDER?.trim() || DEFAULT_PP_PRESENTATIONS_FOLDER;
  return [root, pp];
}

/** Path from Drive root to slide-deck publish folder (service subfolders created per publish). */
export function resolvePpPlaylistsFolderPath(): string[] {
  const override = splitPath(process.env.PP_PLAYLISTS_FOLDER_PATH);
  if (override) return override;
  const sub = process.env.PP_PLAYLISTS_SUBFOLDER?.trim() || DEFAULT_PP_PLAYLISTS_FOLDER;
  return [...defaultProPresenterPath(), sub];
}

/** Path from Drive root to additive asset imports for the presentation rig. */
export function resolvePpNewFilesFolderPath(): string[] {
  const override = splitPath(process.env.PP_NEW_FILES_FOLDER_PATH);
  if (override) return override;
  const sub = process.env.PP_NEW_FILES_SUBFOLDER?.trim() || DEFAULT_PP_NEW_FILES_FOLDER;
  return [...defaultProPresenterPath(), sub];
}

export function resolvePpDriveFolderRefs(): PpDriveFolderRefs {
  return {
    playlistsFolderId: process.env.PP_PLAYLISTS_FOLDER_ID?.trim() || undefined,
    newFilesFolderId: process.env.PP_NEW_FILES_FOLDER_ID?.trim() || undefined,
    playlistsPath: resolvePpPlaylistsFolderPath(),
    newFilesPath: resolvePpNewFilesFolderPath(),
  };
}
