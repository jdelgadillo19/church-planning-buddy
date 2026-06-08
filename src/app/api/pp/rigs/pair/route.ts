import { NextResponse } from "next/server";
import { RIG_CORS_HEADERS } from "@/lib/http/rig-cors";
import { pairRigWithCode } from "@/lib/pp-platform/rig-pairing";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: RIG_CORS_HEADERS });
}

/** CORS preflight for Grapevine Rig pairing fetch. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: RIG_CORS_HEADERS });
}

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
      return json({ ok: false, error: "code is required." }, 400);
    }

    const { rig, rigSecret } = await pairRigWithCode({
      code: body.code,
      displayName: body.displayName ?? "Presentation rig",
      deviceFingerprint: body.deviceFingerprint,
      publicKey: body.publicKey,
    });

    return json({
      ok: true,
      rigId: rig.id,
      orgId: rig.org_id,
      displayName: rig.display_name,
      rigSecret,
      apiBaseUrl: process.env.GRAPEVINE_PREP_URL?.trim() || "https://grapevineprep.com",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pairing failed.";
    return json({ ok: false, error: message }, 400);
  }
}
