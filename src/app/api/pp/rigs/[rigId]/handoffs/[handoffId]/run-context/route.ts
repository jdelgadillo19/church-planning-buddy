import { NextResponse } from "next/server";
import { authenticateRigOrBootstrap } from "@/lib/pp-platform/rig-auth";
import { getHandoffById } from "@/lib/pp-platform/submissions";
import { loadGoogleOAuthConfigFromEnv } from "@/lib/google/auth";
import { loadOrgLibrarianTokens } from "@/lib/google/org-librarian-drive";
import { loadGoogleTokensForUser } from "@/lib/google/token-store";

type RouteContext = { params: Promise<{ rigId: string; handoffId: string }> };

/** GET — Drive download context for rig handoff import worker. */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { rigId, handoffId } = await context.params;
    const rig = await authenticateRigOrBootstrap(req, rigId);
    if (!rig || rig.id !== rigId) {
      return NextResponse.json({ ok: false, error: "Rig not authorized." }, { status: 401 });
    }

    const handoff = await getHandoffById(handoffId);
    if (!handoff || handoff.org_id !== rig.org_id) {
      return NextResponse.json({ ok: false, error: "Handoff not found." }, { status: 404 });
    }

    const googleOAuth = loadGoogleOAuthConfigFromEnv();
    if (!googleOAuth) {
      return NextResponse.json(
        { ok: false, error: "Google OAuth is not configured on Grapevine Prep." },
        { status: 500 },
      );
    }

    const librarianTokens = await loadOrgLibrarianTokens(rig.org_id);
    const googleTokens = librarianTokens ?? (await loadGoogleTokensForUser(handoff.created_by));
    if (!googleTokens?.access_token && !googleTokens?.refresh_token) {
      return NextResponse.json(
        { ok: false, error: "File librarian Google tokens unavailable for Drive download." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      handoff,
      googleTokens,
      googleOAuth,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load handoff run context.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
