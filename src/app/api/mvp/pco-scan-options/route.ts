import { NextResponse } from "next/server";
import { listImmediateDriveDocuments } from "@/lib/google/drive-files";
import { isGoogleDriveUrl, parseGoogleDriveUrl } from "@/lib/google/drive-url";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { buildAuthHeader } from "@/lib/pco/client";
import { resolveScanDriveUrl } from "@/lib/pco/attachment-open";
import {
  attachmentName,
  attachmentUrl,
  classifyAttachmentTier,
  isSongScanCandidateName,
  listSongAttachments,
  type ScanTier,
} from "@/lib/pco/scans";

export type ManualDriveScanOption = {
  driveFileId: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  priorityScore: number;
  pcoAttachmentId: string;
  pcoAttachmentName: string;
  tier: ScanTier;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { songId?: string; arrangementId?: string };
    const songId = body.songId?.trim();
    const arrangementId = body.arrangementId?.trim() || null;

    if (!songId) {
      return NextResponse.json({ ok: false, error: "songId is required." }, { status: 400 });
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    const pcoAuth = buildAuthHeader();
    if (!pcoAuth) {
      return NextResponse.json({ ok: false, error: "Planning Center auth not configured." }, { status: 500 });
    }

    const attachments = await listSongAttachments(songId, pcoAuth, arrangementId);
    const seen = new Set<string>();
    const options: ManualDriveScanOption[] = [];

    for (const att of attachments) {
      if (!att.id || !isSongScanCandidateName(attachmentName(att))) continue;

      const pcoAttachmentName = attachmentName(att);
      const tier = classifyAttachmentTier(pcoAttachmentName) ?? "yellow";

      const driveUrl = await resolveScanDriveUrl(pcoAuth, {
        url: attachmentUrl(att),
        attachmentId: att.id,
        songId,
        arrangementId: arrangementId ?? undefined,
      });

      if (!driveUrl || !isGoogleDriveUrl(driveUrl)) continue;

      const parsed = parseGoogleDriveUrl(driveUrl);
      if (!parsed?.id) continue;

      const docs = await listImmediateDriveDocuments(tokens!, parsed.id);
      for (const doc of docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        options.push({
          driveFileId: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
          webViewLink: doc.webViewLink,
          priorityScore: doc.priorityScore ?? 0,
          pcoAttachmentId: att.id,
          pcoAttachmentName,
          tier,
        });
      }
    }

    options.sort((a, b) => b.priorityScore - a.priorityScore);

    return NextResponse.json({ ok: true, options });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list PCO song scans.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
