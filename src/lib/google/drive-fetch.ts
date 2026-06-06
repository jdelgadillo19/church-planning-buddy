import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { refreshGoogleOAuthTokens } from "@/lib/google/oauth-exchange";
import { driveFileAccessErrorMessage, type DriveFileAccessResult } from "./drive-files";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

const FILE_FIELDS_BASIC = "id,name,mimeType,webViewLink";
const FILE_FIELDS_META =
  "id,name,mimeType,webViewLink,parents,driveId,shortcutDetails";

export type DriveFileMeta = {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  parents?: string[];
  driveId?: string | null;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
};

/** Return a usable access token, refreshing via fetch when near expiry. */
export async function resolveGoogleAccessToken(tokens: GoogleTokens): Promise<string | null> {
  const expiring =
    tokens.expiry_date != null && tokens.expiry_date < Date.now() + 60_000;
  if (expiring && tokens.refresh_token) {
    try {
      const refreshed = await refreshGoogleOAuthTokens(tokens.refresh_token);
      tokens.access_token = refreshed.access_token;
      tokens.refresh_token = refreshed.refresh_token ?? tokens.refresh_token;
      tokens.scope = refreshed.scope ?? tokens.scope;
      tokens.expiry_date = refreshed.expiry_date;
    } catch {
      /* use existing access_token if refresh fails */
    }
  }
  return tokens.access_token ?? null;
}

export async function driveGetFileMetaFetch(
  accessToken: string,
  fileId: string,
): Promise<DriveFileMeta | null> {
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", FILE_FIELDS_META);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  try {
    const data = (await res.json()) as DriveFileMeta;
    return data.id ? data : null;
  } catch {
    return null;
  }
}

export type DriveListFilesOptions = {
  q: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  corpora?: "user" | "drive" | "allDrives";
  driveId?: string;
};

export async function driveListFilesFetch(
  accessToken: string,
  opts: DriveListFilesOptions,
): Promise<{ files: DriveFileMeta[]; nextPageToken?: string }> {
  const url = new URL(DRIVE_FILES);
  url.searchParams.set("q", opts.q);
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,webViewLink,shortcutDetails)",
  );
  url.searchParams.set("pageSize", String(opts.pageSize ?? 200));
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (opts.orderBy) url.searchParams.set("orderBy", opts.orderBy);
  if (opts.pageToken) url.searchParams.set("pageToken", opts.pageToken);
  url.searchParams.set("corpora", opts.corpora ?? "allDrives");
  if (opts.driveId) url.searchParams.set("driveId", opts.driveId);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { files: [] };

  const data = (await res.json()) as {
    files?: DriveFileMeta[];
    nextPageToken?: string;
  };
  return {
    files: (data.files ?? []).filter((f) => Boolean(f.id)),
    nextPageToken: data.nextPageToken,
  };
}

export async function driveGetFileByIdFetch(
  accessToken: string,
  fileId: string,
): Promise<DriveFileAccessResult> {
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", FILE_FIELDS_BASIC);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    return { ok: false, code: res.status, message: driveFileAccessErrorMessage(res.status) };
  }

  let data: DriveFileMeta;
  try {
    data = (await res.json()) as DriveFileMeta;
  } catch {
    return { ok: false, code: 500, message: "Drive API response was not JSON." };
  }

  if (!data.id) {
    return { ok: false, code: 404, message: driveFileAccessErrorMessage(404) };
  }

  return {
    ok: true,
    doc: {
      id: data.id,
      name: data.name ?? "(untitled)",
      mimeType: data.mimeType ?? "application/vnd.google-apps.document",
      webViewLink: data.webViewLink ?? undefined,
    },
  };
}

async function driveExportPlainText(accessToken: string, fileId: string): Promise<string> {
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(fileId)}/export`);
  url.searchParams.set("mimeType", "text/plain");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive text export failed (${res.status}).`);
  }
  return res.text();
}

async function driveDownloadTextMedia(accessToken: string, fileId: string): Promise<string> {
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive file download failed (${res.status}).`);
  }
  return res.text();
}

/** Export or download file contents as plain text (Workers-safe; no googleapis SDK). */
export async function exportDriveFilePlainTextFetch(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const meta = await driveGetFileMetaFetch(accessToken, fileId);
  if (!meta?.id) throw new Error("Drive file not found.");
  const mime = meta.mimeType ?? "";

  if (mime === "application/vnd.google-apps.document") {
    return driveExportPlainText(accessToken, fileId);
  }

  if (mime.startsWith("text/")) {
    return driveDownloadTextMedia(accessToken, fileId);
  }

  if (mime === "application/pdf") {
    try {
      return await driveExportPlainText(accessToken, fileId);
    } catch {
      throw new Error(`Cannot extract text from file type: ${mime}`);
    }
  }

  throw new Error(`Unsupported file type for text export: ${mime || "unknown"}`);
}

export async function exportDriveFilePlainTextForTokens(
  tokens: GoogleTokens,
  fileId: string,
): Promise<string> {
  const accessToken = await resolveGoogleAccessToken(tokens);
  if (!accessToken) throw new Error("Google access token unavailable.");
  return exportDriveFilePlainTextFetch(accessToken, fileId);
}

export type DriveCopiedFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

export async function driveFindDocByTitleInParentFetch(
  accessToken: string,
  title: string,
  parentFolderId: string,
): Promise<DriveCopiedFile | null> {
  const escaped = title.replaceAll("'", "\\'");
  const q =
    `mimeType='application/vnd.google-apps.document' and name = '${escaped}' ` +
    `and '${parentFolderId.replaceAll("'", "\\'")}' in parents and trashed=false`;
  const { files } = await driveListFilesFetch(accessToken, {
    q,
    pageSize: 5,
    orderBy: "modifiedTime desc",
  });
  const first = files.find((f) => f.id && f.name);
  if (!first?.id) return null;
  return {
    id: first.id,
    name: first.name ?? title,
    mimeType: first.mimeType ?? "application/vnd.google-apps.document",
    webViewLink: first.webViewLink,
  };
}

export async function driveDeleteFileFetch(accessToken: string, fileId: string): Promise<void> {
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete failed (${res.status}).`);
  }
}

export async function driveCopyFileFetch(
  accessToken: string,
  fileId: string,
  name: string,
  parentFolderId?: string,
): Promise<DriveCopiedFile> {
  const url = new URL(`${DRIVE_FILES}/${encodeURIComponent(fileId)}/copy`);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", FILE_FIELDS_BASIC);

  const body: { name: string; parents?: string[] } = { name };
  if (parentFolderId) body.parents = [parentFolderId];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive copy failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as DriveFileMeta;
  if (!data.id) throw new Error("Drive copy did not return a file id.");
  return {
    id: data.id,
    name: data.name ?? name,
    mimeType: data.mimeType ?? "application/vnd.google-apps.document",
    webViewLink: data.webViewLink,
  };
}

/** Trash prior output (if any), then copy template into the output folder. */
export async function recreateOutputFromTemplateFetch(
  tokens: GoogleTokens,
  templateId: string,
  outputTitle: string,
  outputFolderId: string,
): Promise<DriveCopiedFile> {
  const accessToken = await resolveGoogleAccessToken(tokens);
  if (!accessToken) throw new Error("Google access token unavailable.");

  const existing = await driveFindDocByTitleInParentFetch(
    accessToken,
    outputTitle,
    outputFolderId,
  );
  if (existing?.id) {
    await driveDeleteFileFetch(accessToken, existing.id);
  }

  return driveCopyFileFetch(accessToken, templateId, outputTitle, outputFolderId);
}

export async function driveListDocNamesInFolderFetch(
  accessToken: string,
  folderId: string,
  limit = 10,
): Promise<string[]> {
  const q =
    `mimeType='application/vnd.google-apps.document' ` +
    `and '${folderId.replaceAll("'", "\\'")}' in parents and trashed=false`;
  const { files } = await driveListFilesFetch(accessToken, {
    q,
    pageSize: limit,
    orderBy: "modifiedTime desc",
  });
  return files.map((f) => f.name).filter((name): name is string => Boolean(name));
}
