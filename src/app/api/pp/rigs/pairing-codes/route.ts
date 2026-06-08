import { NextResponse } from "next/server";
import { createPairingCode } from "@/lib/pp-platform/rig-pairing";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

/** POST — org admin creates a rig pairing code. */
export async function POST(req: Request) {
  try {
    if (!isGrapevineAuthEnabled()) {
      return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 401 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as { orgId?: string };
    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org || org.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Org admin required." }, { status: 403 });
    }

    const pairing = await createPairingCode({
      orgId: org.orgId,
      createdBy: user.id,
    });

    return NextResponse.json({ ok: true, ...pairing, orgId: org.orgId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create pairing code.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
