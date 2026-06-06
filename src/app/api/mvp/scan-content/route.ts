import { NextResponse } from "next/server";
import { extractPlainPreview, loadSourceGoogleDoc } from "@/lib/docs/scan-import";
import { exportDriveFilePlainTextForTokens } from "@/lib/google/drive-fetch";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { fileId?: string };
    const fileId = body.fileId?.trim();
    if (!fileId) {
      return NextResponse.json({ ok: false, error: "fileId required." }, { status: 400 });
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    try {
      const source = await loadSourceGoogleDoc(tokens!, fileId);
      const text = extractPlainPreview(source, 50_000);
      if (!text.trim()) {
        return NextResponse.json({
          ok: false,
          error: "No extractable text in this file (image-only PDF etc.). Notify and skip for MVP.",
        });
      }
      return NextResponse.json({ ok: true, text, importMode: "styled" });
    } catch {
      const text = await exportDriveFilePlainTextForTokens(tokens!, fileId);
      if (!text.trim()) {
        return NextResponse.json({
          ok: false,
          error: "No extractable text in this file (image-only PDF etc.). Notify and skip for MVP.",
        });
      }
      return NextResponse.json({ ok: true, text, importMode: "plain" });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load scan content.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
