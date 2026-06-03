import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadProPresenterSupportFilesPath } from "./support-files-path";

export type PlaylistDocumentExport = {
  /** Bytes of the internal Playlists/ document (not a portable export — do not use for Drive publish). */
  bytes: Buffer;
  /** Path under the support-files root, e.g. `Playlists/Sundays/2026.06.08-SUN`. */
  relativePath: string;
  sourceAbsolutePath: string;
};

function normalizeCompare(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeZipEntryBase(name: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return cleaned || "playlist";
}

export function playlistProplaylistEntryName(playlistName: string): string {
  return `${sanitizeZipEntryBase(playlistName)}.proplaylist`;
}

async function walkFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full, depth + 1)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function fileContainsUuid(filePath: string, uuid: string): Promise<boolean> {
  const buf = await readFile(filePath);
  return buf.includes(Buffer.from(uuid, "utf8"));
}

/**
 * Locate the internal ProPresenter Playlists/ protobuf on disk (sync/diff only — not File → Export).
 */
export async function readPlaylistDocumentFromSupportFiles(input: {
  supportFilesRoot: string;
  playlistId: string;
  playlistName: string;
}): Promise<PlaylistDocumentExport> {
  const playlistsDir = join(input.supportFilesRoot, "Playlists");
  let playlistsStat;
  try {
    playlistsStat = await stat(playlistsDir);
  } catch {
    throw new Error(
      `ProPresenter Playlists folder not found at "${playlistsDir}". Check PP_SUPPORT_FILES_PATH.`,
    );
  }
  if (!playlistsStat.isDirectory()) {
    throw new Error(`PP_SUPPORT_FILES_PATH Playlists path is not a directory: ${playlistsDir}`);
  }

  const id = input.playlistId.trim();
  const nameKey = normalizeCompare(input.playlistName);
  const files = await walkFiles(playlistsDir);

  const byUuid: string[] = [];
  const byName: string[] = [];
  const byIdBasename: string[] = [];

  for (const file of files) {
    const base = basename(file);
    const baseKey = normalizeCompare(base);
    if (baseKey === normalizeCompare(id)) byIdBasename.push(file);
    if (baseKey === nameKey) byName.push(file);
    try {
      if (await fileContainsUuid(file, id)) byUuid.push(file);
    } catch {
      /* skip unreadable */
    }
  }

  const pick =
    (byUuid.length === 1 ? byUuid[0] : byUuid.length > 1 ? byUuid[0] : undefined) ??
    (byName.length === 1 ? byName[0] : byName.length > 1 ? byName[0] : undefined) ??
    (byIdBasename.length === 1 ? byIdBasename[0] : undefined);

  if (!pick) {
    throw new Error(
      `Could not find playlist document for "${input.playlistName}" (${id}) under ${playlistsDir}. ` +
        "Apply the playlist in ProPresenter, confirm PP_SUPPORT_FILES_PATH, then publish again.",
    );
  }

  const bytes = await readFile(pick);
  const relativePath = pick.slice(input.supportFilesRoot.length).replace(/^[/\\]/, "");

  return {
    bytes,
    relativePath,
    sourceAbsolutePath: pick,
  };
}

export async function exportPlaylistDocumentForPublish(input: {
  playlistId: string;
  playlistName: string;
  env?: NodeJS.ProcessEnv;
}): Promise<PlaylistDocumentExport> {
  const supportFilesRoot = loadProPresenterSupportFilesPath(input.env);
  if (!supportFilesRoot) {
    throw new Error(
      "Set PP_SUPPORT_FILES_PATH in .env.local to your ProPresenter Support Files folder " +
        "(ProPresenter → Preferences → Advanced) to export the playlist zip.",
    );
  }
  return readPlaylistDocumentFromSupportFiles({
    supportFilesRoot,
    playlistId: input.playlistId,
    playlistName: input.playlistName,
  });
}
