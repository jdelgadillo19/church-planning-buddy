import { NextResponse } from "next/server";
import { approveHandoffForRig, getHandoffById } from "@/lib/pp-platform/submissions";
import { isOrgAdmin, resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

type RouteContext = { params: Promise<{ id: string }> };

/** POST — admin signs off a complete handoff for rig auto-import. */
export async function POST(req: Request, context: RouteContext) {
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

    const { id: handoffId } = await context.params;
    const body = (await req.json()) as { orgId?: string };
    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org || !isOrgAdmin(org.role)) {
      return NextResponse.json({ ok: false, error: "Admin role required." }, { status: 403 });
    }

    const existing = await getHandoffById(handoffId);
    if (!existing || existing.org_id !== org.orgId) {
      return NextResponse.json({ ok: false, error: "Handoff not found." }, { status: 404 });
    }
    if (existing.handoff_status !== "complete") {
      return NextResponse.json(
        { ok: false, error: "Only complete handoffs can be approved for rig delivery." },
        { status: 400 },
      );
    }

    const submission = await approveHandoffForRig(handoffId);
    return NextResponse.json({ ok: true, submission });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to approve handoff.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
