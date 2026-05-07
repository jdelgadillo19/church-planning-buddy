import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuthClient } from "../../auth/google/_oauth";
import { loadTokensForCurrentSession } from "../../auth/google/_session";

function isGoogleDoc(file: unknown): file is { id?: string | null; name?: string | null } {
  return typeof file === "object" && file !== null;
}

export async function POST() {
  const tokens = loadTokensForCurrentSession();
  if (!tokens?.access_token && !tokens?.refresh_token) {
    return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
  }

  const auth = getOAuthClient();
  auth.setCredentials(tokens);

  const drive = google.drive({ version: "v3", auth });

  const list = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.document' and name contains 'blank' and trashed=false",
    fields: "files(id,name)",
    pageSize: 10,
    orderBy: "modifiedTime desc",
  });

  const files = Array.isArray(list.data.files) ? list.data.files : [];
  const first = files.find(isGoogleDoc);
  const fileId = first?.id ?? null;

  if (!fileId) {
    return NextResponse.json({ ok: false, error: "No Google Doc with 'blank' in the title found." }, { status: 404 });
  }

  const exported = await drive.files.export(
    { fileId, mimeType: "text/plain" },
    { responseType: "text" },
  );

  const text = typeof exported.data === "string" ? exported.data : "";
  return NextResponse.json({
    ok: true,
    file: { id: fileId, name: first?.name ?? "" },
    text,
  });
}

