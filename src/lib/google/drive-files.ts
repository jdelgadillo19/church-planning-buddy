import type { drive_v3 } from "googleapis";
import { parseGoogleDriveUrl } from "./drive-url";

export const SHARED_DRIVE_OPTS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

const FILE_FIELDS = "id,name,mimeType,webViewLink,parents,driveId,shortcutDetails";

export type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

export type DriveSearchRoot = {
  id: string;
  name: string;
  driveId?: string | null;
};

export type ResolveBlankResult = {
  candidates: DriveCandidate[];
  searchRoot?: DriveSearchRoot;
  pcoUrl: string;
  error?: string;
};

function isFolderMime(mime: string) {
  return mime === "application/vnd.google-apps.folder";
}

function isShortcutMime(mime: string) {
  return mime === "application/vnd.google-apps.shortcut";
}

function driveAccessErrorMessage(err: unknown): string {
  const e = err as { code?: number; message?: string };
  const code = e?.code;
  if (code === 403 || code === 404) {
    return (
      "Cannot access this Drive link. Confirm your connected Google account can open the PCO " +
      "attachment URL in the browser (org/shared drive read access)."
    );
  }
  return e?.message ?? "Drive API request failed.";
}

export async function findDocById(drive: drive_v3.Drive, fileId: string): Promise<DriveCandidate | null> {
  try {
    const res = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,webViewLink",
      ...SHARED_DRIVE_OPTS,
    });
    if (!res.data.id) return null;
    return {
      id: res.data.id,
      name: res.data.name ?? "(untitled)",
      mimeType: res.data.mimeType ?? "application/vnd.google-apps.document",
      webViewLink: res.data.webViewLink ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function findDocByTitle(drive: drive_v3.Drive, title: string): Promise<DriveCandidate | null> {
  const escaped = title.replaceAll("'", "\\'");
  const q = `mimeType='application/vnd.google-apps.document' and name = '${escaped}' and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name,mimeType,webViewLink)",
    pageSize: 10,
    orderBy: "modifiedTime desc",
    corpora: "allDrives",
    ...SHARED_DRIVE_OPTS,
  });

  const files = list.data.files ?? [];
  const first = files.find((f) => f.id && f.name);
  if (!first?.id) return null;

  return {
    id: first.id,
    name: first.name ?? title,
    mimeType: first.mimeType ?? "application/vnd.google-apps.document",
    webViewLink: first.webViewLink ?? undefined,
  };
}

async function listChildren(drive: drive_v3.Drive, parentId: string): Promise<drive_v3.Schema$File[]> {
  const out: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType,webViewLink,shortcutDetails)",
      pageSize: 200,
      pageToken,
      corpora: "allDrives",
      ...SHARED_DRIVE_OPTS,
    });
    out.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}

async function getFileMeta(drive: drive_v3.Drive, fileId: string) {
  const res = await drive.files.get({
    fileId,
    fields: FILE_FIELDS,
    ...SHARED_DRIVE_OPTS,
  });
  return res.data;
}

/** Resolve shortcuts and return the file/folder metadata to search from. */
export async function resolveDriveRoot(
  drive: drive_v3.Drive,
  entryId: string,
): Promise<{ file: drive_v3.Schema$File; searchRoot: DriveSearchRoot }> {
  let file = await getFileMeta(drive, entryId);
  if (!file.id) throw new Error("Drive file not found.");

  if (isShortcutMime(file.mimeType ?? "") && file.shortcutDetails?.targetId) {
    file = await getFileMeta(drive, file.shortcutDetails.targetId);
    if (!file.id) throw new Error("Drive shortcut target not found.");
  }

  const mime = file.mimeType ?? "";
  const name = file.name ?? "(unnamed)";

  if (isFolderMime(mime)) {
    return {
      file,
      searchRoot: { id: file.id!, name, driveId: file.driveId },
    };
  }

  if (name.toLowerCase().includes("blank")) {
    return {
      file,
      searchRoot: { id: file.id!, name, driveId: file.driveId },
    };
  }

  const parentId = file.parents?.[0];
  if (!parentId) {
    throw new Error(`No parent folder for "${name}" — cannot search for blank scans.`);
  }

  const parent = await getFileMeta(drive, parentId);
  if (!parent.id) throw new Error("Parent folder not found.");

  return {
    file,
    searchRoot: {
      id: parent.id,
      name: parent.name ?? "Parent folder",
      driveId: parent.driveId ?? file.driveId,
    },
  };
}

export async function searchSubtreeForBlankDocs(
  drive: drive_v3.Drive,
  rootId: string,
): Promise<DriveCandidate[]> {
  const matches: DriveCandidate[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (seen.has(parentId)) continue;
    seen.add(parentId);

    const children = await listChildren(drive, parentId);
    for (const child of children) {
      if (!child.id) continue;
      let id = child.id;
      let name = child.name ?? "";
      let mime = child.mimeType ?? "";
      let webViewLink = child.webViewLink ?? undefined;

      if (isShortcutMime(mime) && child.shortcutDetails?.targetId) {
        try {
          const target = await getFileMeta(drive, child.shortcutDetails.targetId);
          if (target.id) {
            id = target.id;
            name = target.name ?? name;
            mime = target.mimeType ?? mime;
            webViewLink = target.webViewLink ?? webViewLink;
          }
        } catch {
          continue;
        }
      }

      if (isFolderMime(mime)) {
        queue.push(id);
        continue;
      }

      if (name.toLowerCase().includes("blank")) {
        matches.push({ id, name, mimeType: mime, webViewLink });
      }
    }
  }

  return matches;
}

export async function resolveBlankCandidatesFromPcoUrl(
  drive: drive_v3.Drive,
  pcoUrl: string,
): Promise<ResolveBlankResult> {
  const base = { pcoUrl, candidates: [] as DriveCandidate[] };

  if (!pcoUrl.trim()) return { ...base, error: "No scan URL." };

  const parsed = parseGoogleDriveUrl(pcoUrl);
  if (!parsed) {
    return { ...base, error: "Not a Google Drive URL (MVP expects Drive links)." };
  }

  try {
    const entryId = parsed.id;
    const { file, searchRoot } = await resolveDriveRoot(drive, entryId);

    const fileName = file.name ?? "";
    if (!isFolderMime(file.mimeType ?? "") && fileName.toLowerCase().includes("blank") && file.id) {
      return {
        pcoUrl,
        searchRoot,
        candidates: [
          {
            id: file.id,
            name: fileName,
            mimeType: file.mimeType ?? "",
            webViewLink: file.webViewLink ?? undefined,
          },
        ],
      };
    }

    const candidates = await searchSubtreeForBlankDocs(drive, searchRoot.id);
    if (candidates.length === 0) {
      return {
        pcoUrl,
        searchRoot,
        candidates: [],
        error: `Searched "${searchRoot.name}" (from PCO link); no titles containing "blank".`,
      };
    }

    return { pcoUrl, searchRoot, candidates };
  } catch (err) {
    return { ...base, error: driveAccessErrorMessage(err) };
  }
}

export async function copyGoogleDoc(
  drive: drive_v3.Drive,
  templateId: string,
  outputName: string,
): Promise<DriveCandidate> {
  const res = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: outputName },
    fields: "id,name,mimeType,webViewLink",
    ...SHARED_DRIVE_OPTS,
  });
  if (!res.data.id) throw new Error("Drive copy did not return a file id.");
  return {
    id: res.data.id,
    name: res.data.name ?? outputName,
    mimeType: res.data.mimeType ?? "application/vnd.google-apps.document",
    webViewLink: res.data.webViewLink ?? undefined,
  };
}

/** Remove an existing output doc so the next copy is idempotent. */
export async function deleteDocIfExists(drive: drive_v3.Drive, title: string): Promise<void> {
  const existing = await findDocByTitle(drive, title);
  if (!existing) return;
  await drive.files.delete({ fileId: existing.id, ...SHARED_DRIVE_OPTS });
}

/** Fresh output from template: trash prior output (if any), then copy template by name. */
export async function recreateOutputFromTemplate(
  drive: drive_v3.Drive,
  templateId: string,
  outputTitle: string,
): Promise<DriveCandidate> {
  await deleteDocIfExists(drive, outputTitle);
  return copyGoogleDoc(drive, templateId, outputTitle);
}

export async function exportDocPlainText(drive: drive_v3.Drive, fileId: string): Promise<string> {
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType,name",
    ...SHARED_DRIVE_OPTS,
  });
  const mime = meta.data.mimeType ?? "";

  if (mime === "application/vnd.google-apps.document") {
    const exported = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    return typeof exported.data === "string" ? exported.data : "";
  }

  if (mime.startsWith("text/") || mime === "application/pdf") {
    try {
      const exported = await drive.files.export(
        { fileId, mimeType: "text/plain" },
        { responseType: "text" },
      );
      return typeof exported.data === "string" ? exported.data : "";
    } catch {
      throw new Error(`Cannot extract text from file type: ${mime}`);
    }
  }

  throw new Error(`Unsupported file type for text export: ${mime}`);
}
