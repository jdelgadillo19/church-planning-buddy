import type { drive_v3 } from "googleapis";
import { resolveGrgDriveFolderRefs } from "@/lib/config/grg-drive";
import {
  findDocById,
  findDocByTitle,
  SHARED_DRIVE_OPTS,
  type DriveCandidate,
} from "./drive-files";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function escapeDriveQueryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export async function listMatchingFolders(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string,
): Promise<drive_v3.Schema$File[]> {
  const escaped = escapeDriveQueryValue(name);
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `mimeType='${FOLDER_MIME}' and name = '${escaped}' and trashed=false${parentClause}`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name,modifiedTime)",
    pageSize: 25,
    orderBy: "modifiedTime desc",
    corpora: "allDrives",
    ...SHARED_DRIVE_OPTS,
  });
  return (list.data.files ?? []).filter((f) => f.id);
}

/** Walk nested folder names; disambiguates duplicates by preferring a branch that contains the next segment. */
export async function resolveFolderByPath(
  drive: drive_v3.Drive,
  segments: string[],
): Promise<string | null> {
  if (segments.length === 0) return null;

  let parentId: string | undefined;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const matches = await listMatchingFolders(drive, segment, parentId);
    if (matches.length === 0) return null;

    if (matches.length === 1) {
      parentId = matches[0]!.id!;
      continue;
    }

    const nextSegment = segments[i + 1];
    if (nextSegment) {
      for (const candidate of matches) {
        if (!candidate.id) continue;
        const child = await listMatchingFolders(drive, nextSegment, candidate.id);
        if (child.length > 0) {
          parentId = candidate.id;
          break;
        }
      }
      if (!parentId) parentId = matches[0]!.id!;
    } else {
      parentId = matches[0]!.id!;
    }
  }

  return parentId ?? null;
}

export async function resolveGrgTemplateFolderId(drive: drive_v3.Drive): Promise<string> {
  const refs = resolveGrgDriveFolderRefs();
  if (refs.templateFolderId) return refs.templateFolderId;

  const id = await resolveFolderByPath(drive, refs.templatePath);
  if (!id) {
    throw new Error(
      `GRG template folder not found at "${refs.templatePath.join("/")}". ` +
        "Create it on Drive or set GRG_TEMPLATE_FOLDER_ID / GRG_TEMPLATE_FOLDER_PATH.",
    );
  }
  return id;
}

export async function resolveGrgOutputFolderId(drive: drive_v3.Drive): Promise<string> {
  const refs = resolveGrgDriveFolderRefs();
  if (refs.outputFolderId) return refs.outputFolderId;

  const id = await resolveFolderByPath(drive, refs.outputPath);
  if (!id) {
    throw new Error(
      `GRG output folder not found at "${refs.outputPath.join("/")}". ` +
        "Create it on Drive or set GRG_OUTPUT_FOLDER_ID / GRG_OUTPUT_FOLDER_PATH.",
    );
  }
  return id;
}

export async function findDocByTitleInFolder(
  drive: drive_v3.Drive,
  folderId: string,
  title: string,
): Promise<DriveCandidate | null> {
  const escaped = escapeDriveQueryValue(title);
  const q =
    `mimeType='application/vnd.google-apps.document' and name = '${escaped}' ` +
    `and '${folderId}' in parents and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name,mimeType,webViewLink)",
    pageSize: 10,
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

export async function findGrgTemplateDoc(
  drive: drive_v3.Drive,
  ref: { id?: string; title: string },
): Promise<DriveCandidate> {
  if (ref.id) {
    const byId = await findDocById(drive, ref.id);
    if (byId) return byId;
  }

  const folderId = await resolveGrgTemplateFolderId(drive);
  const byTitle = await findDocByTitleInFolder(drive, folderId, ref.title);
  if (byTitle) return byTitle;

  const hint = ref.id
    ? `id ${ref.id} or title "${ref.title}" in template folder`
    : `title "${ref.title}" in template folder`;
  throw new Error(
    `GRG template not found (${hint}). Create it per docs/GRG-TEMPLATE.md and set GRG_TEMPLATE_TITLE or GRG_TEMPLATE_ID.`,
  );
}

export async function findGrgOutputDoc(
  drive: drive_v3.Drive,
  outputTitle: string,
): Promise<DriveCandidate | null> {
  const folderId = await resolveGrgOutputFolderId(drive);
  return findDocByTitleInFolder(drive, folderId, outputTitle);
}

/** Legacy global title search — used only when output folder cannot be resolved. */
export async function findGrgOutputDocFallback(
  drive: drive_v3.Drive,
  outputTitle: string,
): Promise<DriveCandidate | null> {
  try {
    return await findGrgOutputDoc(drive, outputTitle);
  } catch {
    return findDocByTitle(drive, outputTitle);
  }
}
