import { gunzipSync } from "node:zlib";
import type { GoogleTokens } from "@/app/api/auth/google/_session";
import type { drive_v3 } from "@/lib/google/api-types";
import {
  type DriveFileMeta,
  driveGetFileByIdFetch,
  driveGetFileMetaFetch,
  driveListFilesFetch,
  resolveGoogleAccessToken,
} from "@/lib/google/drive-fetch";
import { pickClearFrontrunner, scoreScanFilename, sortByScanPriority } from "@/lib/scan-selection/priority";
import type { ScanTier } from "@/lib/pco/scans";
import { parseGoogleDriveUrl } from "./drive-url";

export const SHARED_DRIVE_OPTS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

export type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  priorityScore?: number;
};

export type ResolveScanResult = ResolveBlankResult & {
  pass?: 1 | 2;
  autoSelectedId?: string;
  needsSelection?: boolean;
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

export type DriveFileAccessResult =
  | { ok: true; doc: DriveCandidate }
  | { ok: false; code: number; message: string };

export function driveFileAccessErrorMessage(code: number): string {
  if (code === 401) return "Google Drive not connected.";
  if (code === 403) {
    return (
      "Connected account cannot access this file — check sharing or sign in with the church Drive account."
    );
  }
  if (code === 404) return "File not found on Drive.";
  return "Drive API request failed.";
}

export async function findDocByIdWithAccess(
  tokens: GoogleTokens,
  fileId: string,
): Promise<DriveFileAccessResult> {
  const accessToken = await resolveGoogleAccessToken(tokens);
  if (!accessToken) {
    return { ok: false, code: 401, message: driveFileAccessErrorMessage(401) };
  }
  return driveGetFileByIdFetch(accessToken, fileId);
}

export async function findDocById(
  tokens: GoogleTokens,
  fileId: string,
): Promise<DriveCandidate | null> {
  const result = await findDocByIdWithAccess(tokens, fileId);
  return result.ok ? result.doc : null;
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

async function listChildren(tokens: GoogleTokens, parentId: string): Promise<DriveFileMeta[]> {
  const accessToken = await resolveGoogleAccessToken(tokens);
  if (!accessToken) return [];

  const out: DriveFileMeta[] = [];
  let pageToken: string | undefined;

  do {
    const res = await driveListFilesFetch(accessToken, {
      q: `'${parentId.replaceAll("'", "\\'")}' in parents and trashed=false`,
      pageSize: 200,
      pageToken,
    });
    out.push(...res.files);
    pageToken = res.nextPageToken;
  } while (pageToken);

  return out;
}

async function getFileMeta(tokens: GoogleTokens, fileId: string): Promise<DriveFileMeta> {
  const accessToken = await resolveGoogleAccessToken(tokens);
  if (!accessToken) throw new Error("Google Drive not connected.");
  const meta = await driveGetFileMetaFetch(accessToken, fileId);
  if (!meta?.id) throw new Error("Drive file not found.");
  return meta;
}

export type DriveRootResolution = {
  file: DriveFileMeta;
  searchRoot?: DriveSearchRoot;
  /** Parent folder unavailable — search Drive by song title tokens instead. */
  useNameHintSearch?: boolean;
};

/** Strip scan metadata from a Drive filename to get searchable song-title tokens. */
export function extractBlankSearchTokens(scanFileName: string): string[] {
  let name = scanFileName.trim();
  if (!name) return [];

  name = name.replaceAll(/\([^)]*song\s*scan[^)]*\)/gi, "").trim();
  name = name.replaceAll(/\([^)]*resources[^)]*\)/gi, "").trim();
  name = name.replaceAll(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}[^)]*/gi, "").trim();
  name = name.replaceAll(/\b\d{4}\b/g, " ").replaceAll(/\s+/g, " ").trim();

  const stopWords = new Set(["blank", "song", "scan", "master", "lf", "resources", "the", "and", "to", "of"]);
  const words = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (words.length === 0) return [];

  const primary = words.slice(0, 4).join(" ");
  if (primary.length >= 3) return [primary];

  return words.filter((w) => w.length >= 4);
}

export function escapeDriveQueryValue(value: string) {
  return value.replaceAll("'", "\\'");
}

export function buildBlankNameHintQuery(tokens: string[], driveId?: string | null) {
  const parts = [
    "trashed=false",
    "mimeType='application/vnd.google-apps.document'",
    "name contains 'blank'",
  ];
  for (const token of tokens.slice(0, 2)) {
    if (!token.trim()) continue;
    parts.push(`name contains '${escapeDriveQueryValue(token)}'`);
  }
  return parts.join(" and ");
}

export async function searchBlankDocsByNameHint(
  googleTokens: GoogleTokens,
  scanFileName: string,
  driveId?: string | null,
): Promise<DriveCandidate[]> {
  const accessToken = await resolveGoogleAccessToken(googleTokens);
  if (!accessToken) return [];

  const tokens = extractBlankSearchTokens(scanFileName);
  if (tokens.length === 0) return [];

  const matches: DriveCandidate[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const q = buildBlankNameHintQuery([token], driveId);
    const { files } = await driveListFilesFetch(accessToken, {
      q,
      pageSize: 25,
      orderBy: "modifiedTime desc",
      corpora: driveId ? "drive" : "allDrives",
      driveId: driveId ?? undefined,
    });
    for (const f of files) {
      if (!f.id || seen.has(f.id)) continue;
      const fname = f.name ?? "";
      if (!fname.toLowerCase().includes("blank")) continue;
      seen.add(f.id);
      matches.push({
        id: f.id,
        name: fname,
        mimeType: f.mimeType ?? "application/vnd.google-apps.document",
        webViewLink: f.webViewLink ?? undefined,
      });
    }
  }

  return matches;
}

/** Resolve shortcuts and return the file/folder metadata to search from. */
export async function resolveDriveRoot(
  googleTokens: GoogleTokens,
  entryId: string,
): Promise<DriveRootResolution> {
  let file = await getFileMeta(googleTokens, entryId);

  if (isShortcutMime(file.mimeType ?? "") && file.shortcutDetails?.targetId) {
    file = await getFileMeta(googleTokens, file.shortcutDetails.targetId);
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
    return {
      file,
      useNameHintSearch: true,
      searchRoot: {
        id: file.id!,
        name: `${name} (name search)`,
        driveId: file.driveId,
      },
    };
  }

  const parent = await getFileMeta(googleTokens, parentId);

  return {
    file,
    searchRoot: {
      id: parent.id,
      name: parent.name ?? "Parent folder",
      driveId: parent.driveId ?? file.driveId,
    },
  };
}

function isExportableDocMime(mime: string) {
  return (
    mime === "application/vnd.google-apps.document" ||
    mime === "application/vnd.google-apps.spreadsheet" ||
    mime.startsWith("text/")
  );
}

/** Documents directly inside a Drive folder, or the file itself when the link is a document. */
export async function listImmediateDriveDocuments(
  googleTokens: GoogleTokens,
  entryId: string,
): Promise<DriveCandidate[]> {
  let file: DriveFileMeta;
  try {
    file = await getFileMeta(googleTokens, entryId);
  } catch {
    return [];
  }

  if (isShortcutMime(file.mimeType ?? "") && file.shortcutDetails?.targetId) {
    try {
      file = await getFileMeta(googleTokens, file.shortcutDetails.targetId);
    } catch {
      return [];
    }
  }

  const mime = file.mimeType ?? "";
  if (!isFolderMime(mime)) {
    const single = candidateFromFile(file);
    return single ? [single] : [];
  }

  const docs: DriveCandidate[] = [];
  const children = await listChildren(googleTokens, file.id);
  for (const child of children) {
    if (!child.id) continue;
    let id = child.id;
    let name = child.name ?? "";
    let childMime = child.mimeType ?? "";
    let webViewLink = child.webViewLink ?? undefined;

    if (isShortcutMime(childMime) && child.shortcutDetails?.targetId) {
      try {
        const target = await getFileMeta(googleTokens, child.shortcutDetails.targetId);
        id = target.id;
        name = target.name ?? name;
        childMime = target.mimeType ?? childMime;
        webViewLink = target.webViewLink ?? webViewLink;
      } catch {
        continue;
      }
    }

    if (isFolderMime(childMime)) continue;

    if (isExportableDocMime(childMime)) {
      docs.push({
        id,
        name,
        mimeType: childMime,
        webViewLink,
        priorityScore: scoreScanFilename(name),
      });
    }
  }

  return sortByScanPriority(docs);
}

export async function searchSubtreeForDocuments(
  googleTokens: GoogleTokens,
  rootId: string,
): Promise<DriveCandidate[]> {
  const matches: DriveCandidate[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (seen.has(parentId)) continue;
    seen.add(parentId);

    const children = await listChildren(googleTokens, parentId);
    for (const child of children) {
      if (!child.id) continue;
      let id = child.id;
      let name = child.name ?? "";
      let mime = child.mimeType ?? "";
      let webViewLink = child.webViewLink ?? undefined;

      if (isShortcutMime(mime) && child.shortcutDetails?.targetId) {
        try {
          const target = await getFileMeta(googleTokens, child.shortcutDetails.targetId);
          id = target.id;
          name = target.name ?? name;
          mime = target.mimeType ?? mime;
          webViewLink = target.webViewLink ?? webViewLink;
        } catch {
          continue;
        }
      }

      if (isFolderMime(mime)) {
        queue.push(id);
        continue;
      }

      if (isExportableDocMime(mime)) {
        matches.push({ id, name, mimeType: mime, webViewLink });
      }
    }
  }

  return matches;
}

export async function searchSubtreeForBlankDocs(
  googleTokens: GoogleTokens,
  rootId: string,
): Promise<DriveCandidate[]> {
  const matches: DriveCandidate[] = [];
  const queue = [rootId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (seen.has(parentId)) continue;
    seen.add(parentId);

    const children = await listChildren(googleTokens, parentId);
    for (const child of children) {
      if (!child.id) continue;
      let id = child.id;
      let name = child.name ?? "";
      let mime = child.mimeType ?? "";
      let webViewLink = child.webViewLink ?? undefined;

      if (isShortcutMime(mime) && child.shortcutDetails?.targetId) {
        try {
          const target = await getFileMeta(googleTokens, child.shortcutDetails.targetId);
          id = target.id;
          name = target.name ?? name;
          mime = target.mimeType ?? mime;
          webViewLink = target.webViewLink ?? webViewLink;
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

function candidateFromFile(file: DriveFileMeta): DriveCandidate | null {
  if (!file.id) return null;
  const name = file.name ?? "(untitled)";
  return {
    id: file.id,
    name,
    mimeType: file.mimeType ?? "application/vnd.google-apps.document",
    webViewLink: file.webViewLink ?? undefined,
    priorityScore: scoreScanFilename(name),
  };
}

function finalizeCandidates(
  candidates: DriveCandidate[],
  base: { pcoUrl: string; searchRoot?: DriveSearchRoot },
  pass: 1 | 2,
  error?: string,
): ResolveScanResult {
  const scored = sortByScanPriority(candidates);
  const frontrunner = pickClearFrontrunner(
    scored.map((c) => ({ id: c.id, score: c.priorityScore })),
  );

  return {
    ...base,
    candidates: scored,
    pass,
    autoSelectedId: frontrunner?.id,
    needsSelection: scored.length > 1 && !frontrunner,
    error,
  };
}

/** Pass 1: blank-title search (green default). Pass 2 (yellow only): priority-ranked fallbacks. */
export async function resolveScanCandidatesFromPcoUrl(
  googleTokens: GoogleTokens,
  pcoUrl: string,
  scanTier: ScanTier = "green",
): Promise<ResolveScanResult> {
  const base = { pcoUrl, candidates: [] as DriveCandidate[] };

  if (!pcoUrl.trim()) return { ...base, error: "No scan URL." };

  const parsed = parseGoogleDriveUrl(pcoUrl);
  if (!parsed) {
    return { ...base, error: "Not a Google Drive URL (MVP expects Drive links)." };
  }

  try {
    const entryId = parsed.id;
    const { file, searchRoot, useNameHintSearch } = await resolveDriveRoot(googleTokens, entryId);
    const fileName = file.name ?? "";
    const mime = file.mimeType ?? "";
    const isFolder = isFolderMime(mime);
    const ctx = { pcoUrl, searchRoot };

    if (!isFolder && fileName.toLowerCase().includes("blank") && file.id) {
      const single = candidateFromFile(file);
      return finalizeCandidates(single ? [single] : [], ctx, 1);
    }

    const blankCandidates = useNameHintSearch
      ? await searchBlankDocsByNameHint(googleTokens, fileName, file.driveId)
      : searchRoot
        ? await searchSubtreeForBlankDocs(googleTokens, searchRoot.id)
        : [];

    if (blankCandidates.length > 0) {
      return finalizeCandidates(blankCandidates, ctx, 1);
    }

    if (scanTier === "green") {
      const searched = searchRoot?.name ?? fileName;
      const mode = useNameHintSearch ? "by song name" : "in folder";
      return {
        ...ctx,
        candidates: [],
        pass: 1,
        error: `Searched ${mode} for "${searched}"; no titles containing "blank".`,
      };
    }

    // Yellow pass 2: direct document or priority-ranked folder contents
    if (!isFolder && file.id) {
      const direct = candidateFromFile(file);
      if (direct) {
        return finalizeCandidates([direct], ctx, 2);
      }
    }

    if (searchRoot && !useNameHintSearch) {
      const allDocs = await searchSubtreeForDocuments(googleTokens, searchRoot.id);
      if (allDocs.length > 0) {
        return finalizeCandidates(allDocs, ctx, 2);
      }
    }

    if (useNameHintSearch && file.id) {
      const direct = candidateFromFile(file);
      if (direct) {
        return finalizeCandidates([direct], ctx, 2);
      }
    }

    const searched = searchRoot?.name ?? fileName;
    return {
      ...ctx,
      candidates: [],
      pass: 2,
      error: `No usable song scan found under "${searched}" (blank search and priority fallback).`,
    };
  } catch (err) {
    return { ...base, error: driveAccessErrorMessage(err) };
  }
}

/** @deprecated Use resolveScanCandidatesFromPcoUrl */
export async function resolveBlankCandidatesFromPcoUrl(
  googleTokens: GoogleTokens,
  pcoUrl: string,
): Promise<ResolveBlankResult> {
  return resolveScanCandidatesFromPcoUrl(googleTokens, pcoUrl, "green");
}

export async function copyGoogleDoc(
  drive: drive_v3.Drive,
  templateId: string,
  outputName: string,
  parentFolderId?: string,
): Promise<DriveCandidate> {
  const res = await drive.files.copy({
    fileId: templateId,
    requestBody: {
      name: outputName,
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    },
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
export async function deleteDocIfExists(
  drive: drive_v3.Drive,
  title: string,
  parentFolderId?: string,
): Promise<void> {
  const existing = parentFolderId
    ? await findDocByTitleInParent(drive, title, parentFolderId)
    : await findDocByTitle(drive, title);
  if (!existing) return;
  await drive.files.delete({ fileId: existing.id, ...SHARED_DRIVE_OPTS });
}

async function findDocByTitleInParent(
  drive: drive_v3.Drive,
  title: string,
  parentFolderId: string,
): Promise<DriveCandidate | null> {
  const escaped = title.replaceAll("'", "\\'");
  const q =
    `mimeType='application/vnd.google-apps.document' and name = '${escaped}' ` +
    `and '${parentFolderId}' in parents and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name,mimeType,webViewLink)",
    pageSize: 5,
    orderBy: "modifiedTime desc",
    corpora: "allDrives",
    ...SHARED_DRIVE_OPTS,
  });
  const first = (list.data.files ?? []).find((f) => f.id && f.name);
  if (!first?.id) return null;
  return {
    id: first.id,
    name: first.name ?? title,
    mimeType: first.mimeType ?? "application/vnd.google-apps.document",
    webViewLink: first.webViewLink ?? undefined,
  };
}

/** Fresh output from template: trash prior output (if any), then copy template into the output folder. */
export async function recreateOutputFromTemplate(
  drive: drive_v3.Drive,
  templateId: string,
  outputTitle: string,
  outputFolderId: string,
): Promise<DriveCandidate> {
  await deleteDocIfExists(drive, outputTitle, outputFolderId);
  return copyGoogleDoc(drive, templateId, outputTitle, outputFolderId);
}

/** Export a Google Doc (or PDF) as application/pdf bytes. */
export async function exportGoogleDocPdf(drive: drive_v3.Drive, fileId: string): Promise<Buffer> {
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType,name",
    ...SHARED_DRIVE_OPTS,
  });
  const mime = meta.data.mimeType ?? "";

  if (mime === "application/pdf") {
    const downloaded = await drive.files.get(
      { fileId, alt: "media", ...SHARED_DRIVE_OPTS },
      { responseType: "arraybuffer" },
    );
    const data = downloaded.data as ArrayBuffer | Buffer;
    const buf = data instanceof ArrayBuffer ? Buffer.from(data) : data;
    if (!Buffer.isBuffer(buf)) {
      throw new Error("Drive download did not return PDF bytes.");
    }
    // Drive may serve gzip-encoded bytes that gaxios leaves compressed for arraybuffer.
    return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  }

  if (mime !== "application/vnd.google-apps.document") {
    throw new Error(`Cannot export to PDF from file type: ${mime}`);
  }

  const exported = await drive.files.export(
    { fileId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" },
  );
  const data = exported.data as ArrayBuffer | Buffer;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Buffer.isBuffer(data)) return data;
  throw new Error("Drive export did not return PDF bytes.");
}
