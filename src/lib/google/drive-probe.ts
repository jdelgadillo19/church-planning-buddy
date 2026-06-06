import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { resolveGrgTemplateRef } from "@/lib/config/grg";
import { driveFileAccessErrorMessage, findDocByIdWithAccess } from "./drive-files";

export type DriveProbeResult = { ok: true } | { ok: false; code: number; message: string };

/** Drive API probe — uses fetch against GRG template ID when configured. */
export async function probeGoogleDriveAccess(tokens: GoogleTokens): Promise<DriveProbeResult> {
  const templateId = resolveGrgTemplateRef().id;
  if (templateId) {
    const probe = await findDocByIdWithAccess(tokens, templateId);
    if (probe.ok) return { ok: true };
    return { ok: false, code: probe.code, message: probe.message };
  }

  const accessToken = tokens.access_token;
  if (!accessToken) {
    return { ok: false, code: 401, message: driveFileAccessErrorMessage(401) };
  }

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("fields", "files(id)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("corpora", "allDrives");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    return { ok: false, code: res.status, message: driveFileAccessErrorMessage(res.status) };
  }
  return { ok: true };
}
