import { NextResponse } from "next/server";
import { listPendingRigHandoffs } from "@/lib/pp-platform/submissions";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

/** GET — complete handoffs pending rig sync (planner/admin view). */
export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const orgIdParam = url.searchParams.get("orgId")?.trim();
    const org = await resolveUserOrg(supabase, user.id, orgIdParam);
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }

    const handoffs = await listPendingRigHandoffs(org.orgId);
    return NextResponse.json({ ok: true, handoffs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list pending handoffs.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
