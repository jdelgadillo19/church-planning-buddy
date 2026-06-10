import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getAuthedClients } from "@/lib/google/auth";
import type { ScanStyleSpec } from "@/lib/docs/scan-style-template";
import { runApplyScan, type ApplyScanSongInput } from "@/lib/mvp/apply-grg";

export type ApplyScanRequest = {
  grgDocId: string;
  scanStyleSpec: ScanStyleSpec;
  song: ApplyScanSongInput;
  isFirstScan: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ApplyScanRequest;

    const grgDocId = body.grgDocId?.trim();
    if (!grgDocId) {
      return NextResponse.json({ ok: false, error: "Missing grgDocId." }, { status: 400 });
    }
    if (!body.scanStyleSpec) {
      return NextResponse.json({ ok: false, error: "Missing scanStyleSpec." }, { status: 400 });
    }
    if (!body.song?.selectedFileId) {
      return NextResponse.json(
        { ok: false, error: `${body.song?.title ?? "Song"}: no file selected.` },
        { status: 400 },
      );
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    const { drive } = getAuthedClients(tokens!);
    const imported = await runApplyScan(tokens!, drive, {
      grgDocId,
      scanStyleSpec: body.scanStyleSpec,
      song: body.song,
      isFirstScan: Boolean(body.isFirstScan),
    });

    const errors: string[] = [];
    if (imported.warning) {
      errors.push(`${body.song.title}: ${imported.warning} (import mode: ${imported.mode})`);
    }

    return NextResponse.json({
      ok: true,
      title: body.song.title,
      mode: imported.mode,
      warning: imported.warning,
      errors,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scan import failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
