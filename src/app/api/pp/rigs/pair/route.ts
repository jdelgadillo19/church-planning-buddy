import { NextResponse } from "next/server";
import { pairRigWithCode } from "@/lib/pp-platform/rig-pairing";

/** POST — Grapevine Rig exchanges pairing code for rig credentials. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      code?: string;
      displayName?: string;
      deviceFingerprint?: string;
      publicKey?: string;
    };

    if (!body.code?.trim()) {
      return NextResponse.json({ ok: false, error: "code is required." }, { status: 400 });
    }

    const { rig, rigSecret } = await pairRigWithCode({
      code: body.code,
      displayName: body.displayName ?? "Presentation rig",
      deviceFingerprint: body.deviceFingerprint,
      publicKey: body.publicKey,
    });

    return NextResponse.json({
      ok: true,
      rigId: rig.id,
      orgId: rig.org_id,
      displayName: rig.display_name,
      rigSecret,
      apiBaseUrl: process.env.GRAPEVINE_PREP_URL?.trim() || "https://grapevineprep.com",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pairing failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
