import { NextResponse } from "next/server";
import { guardProPresenterOnHosted } from "@/lib/propresenter/hosted-guard";
import { runProPresenterProbe } from "@/lib/propresenter/probe";

export async function POST(req: Request) {
  const hostedBlock = guardProPresenterOnHosted();
  if (hostedBlock) return hostedBlock;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      presentationUuid?: string;
    };
    const report = await runProPresenterProbe({
      presentationUuid: body.presentationUuid,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Probe failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
