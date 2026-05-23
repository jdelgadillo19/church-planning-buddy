import { NextResponse } from "next/server";
import { buildAuthHeader } from "@/lib/pco/client";
import { resolveScanDriveUrl } from "@/lib/pco/attachment-open";
import { getAuthedClients } from "@/lib/google/auth";
import { resolveScanCandidatesFromPcoUrl } from "@/lib/google/drive-files";
import type { ScanTier } from "@/lib/pco/scans";
import { isGoogleDriveUrl } from "@/lib/google/drive-url";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      scanUrl?: string;
      attachmentId?: string;
      songId?: string;
      arrangementId?: string;
      scanTier?: ScanTier;
    };

    let scanUrl = body.scanUrl?.trim() ?? "";
    const attachmentId = body.attachmentId?.trim();
    const songId = body.songId?.trim();
    const arrangementId = body.arrangementId?.trim();

    if (!scanUrl && !attachmentId) {
      return NextResponse.json({ ok: false, error: "No scan URL or attachment ID provided." }, { status: 400 });
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    const pcoAuth = buildAuthHeader();
    if (attachmentId && pcoAuth && (!scanUrl || !isGoogleDriveUrl(scanUrl))) {
      const resolved = await resolveScanDriveUrl(pcoAuth, {
        url: scanUrl,
        attachmentId,
        songId: songId || undefined,
        arrangementId: arrangementId || undefined,
      });
      if (resolved) scanUrl = resolved;
    }

    if (!scanUrl || !isGoogleDriveUrl(scanUrl)) {
      return NextResponse.json({
        ok: true,
        candidates: [],
        pcoUrl: scanUrl,
        needsAcknowledgement: true,
        error:
          "Could not resolve a Google Drive link from this PCO attachment. Open the (Resources) Song Scan MASTER link in PCO and confirm it points to Drive.",
      });
    }

    const scanTier: ScanTier =
      body.scanTier === "yellow" || body.scanTier === "red" ? body.scanTier : "green";

    const { drive } = getAuthedClients(tokens!);
    const result = await resolveScanCandidatesFromPcoUrl(drive, scanUrl, scanTier);

    return NextResponse.json({
      ok: true,
      candidates: result.candidates,
      searchRoot: result.searchRoot,
      pcoUrl: result.pcoUrl,
      resolvedScanUrl: scanUrl,
      pass: result.pass,
      autoSelectedId: result.autoSelectedId,
      needsSelection: result.needsSelection ?? result.candidates.length > 1,
      error: result.error,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resolve candidates.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
