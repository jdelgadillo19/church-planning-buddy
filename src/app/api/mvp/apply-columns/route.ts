import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import type { ScanStyleSpec } from "@/lib/docs/scan-style-template";
import { runApplyColumns } from "@/lib/mvp/apply-grg";

export type ApplyColumnsRequest = {
  grgDocId: string;
  scanStyleSpec: ScanStyleSpec;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ApplyColumnsRequest;

    const grgDocId = body.grgDocId?.trim();
    if (!grgDocId) {
      return NextResponse.json({ ok: false, error: "Missing grgDocId." }, { status: 400 });
    }
    if (!body.scanStyleSpec) {
      return NextResponse.json({ ok: false, error: "Missing scanStyleSpec." }, { status: 400 });
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    await runApplyColumns(tokens!, grgDocId, body.scanStyleSpec);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Column layout failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
