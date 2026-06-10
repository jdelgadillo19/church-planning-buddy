import type { DriveFileMeta } from "./drive-fetch";

const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

/** Inline mirror of resolveDriveExportTarget shortcut logic for unit testing. */
function resolveExportTargetFromMeta(
  meta: DriveFileMeta,
  target?: DriveFileMeta | null,
): { fileId: string; mime: string } {
  let resolvedId = meta.id;
  let mime = meta.mimeType ?? "";

  if (mime === SHORTCUT_MIME && meta.shortcutDetails?.targetId) {
    if (!target?.id) throw new Error("Drive shortcut target not found.");
    resolvedId = target.id;
    mime = target.mimeType ?? meta.shortcutDetails.targetMimeType ?? "";
  }

  return { fileId: resolvedId, mime };
}

{
  const shortcut: DriveFileMeta = {
    id: "shortcut-1",
    mimeType: SHORTCUT_MIME,
    shortcutDetails: { targetId: "doc-1", targetMimeType: GOOGLE_DOC_MIME },
  };
  const target: DriveFileMeta = { id: "doc-1", mimeType: GOOGLE_DOC_MIME };
  const resolved = resolveExportTargetFromMeta(shortcut, target);
  if (resolved.fileId !== "doc-1" || resolved.mime !== GOOGLE_DOC_MIME) {
    throw new Error(`shortcut resolution failed: ${JSON.stringify(resolved)}`);
  }
}

{
  const doc: DriveFileMeta = { id: "doc-2", mimeType: GOOGLE_DOC_MIME };
  const resolved = resolveExportTargetFromMeta(doc);
  if (resolved.fileId !== "doc-2" || resolved.mime !== GOOGLE_DOC_MIME) {
    throw new Error(`direct doc resolution failed: ${JSON.stringify(resolved)}`);
  }
}

{
  const emptyMime: DriveFileMeta = { id: "doc-3" };
  const resolved = resolveExportTargetFromMeta(emptyMime);
  if (resolved.mime !== "") {
    throw new Error("expected empty mime for missing mimeType");
  }
  const label = resolved.mime || "unknown (no mimeType from Drive)";
  if (!label.includes("unknown")) {
    throw new Error(`expected unknown label, got ${label}`);
  }
}

console.log("drive-fetch-export tests ok");
