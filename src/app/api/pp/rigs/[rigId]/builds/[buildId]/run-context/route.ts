import { NextResponse } from "next/server";
import { getBuildById } from "@/lib/pp-platform/builds";
import { authenticateRigOrBootstrap } from "@/lib/pp-platform/rig-auth";
import { loadGoogleOAuthConfigFromEnv } from "@/lib/google/auth";
import { loadGoogleTokensForUser } from "@/lib/google/token-store";

type RouteContext = { params: Promise<{ rigId: string; buildId: string }> };

/** GET — apply/publish context for rig worker (includes refreshed Google tokens). */
export async function GET(req: Request, context: RouteContext) {
  try {
    const { rigId, buildId } = await context.params;
    const rig = await authenticateRigOrBootstrap(req, rigId);
    if (!rig || rig.id !== rigId) {
      return NextResponse.json({ ok: false, error: "Rig not authorized." }, { status: 401 });
    }

    const build = await getBuildById(buildId);
    if (!build || build.org_id !== rig.org_id) {
      return NextResponse.json({ ok: false, error: "Build not found." }, { status: 404 });
    }

    let googleTokens = null;
    let googleOAuth = null;
    if (build.publish_after_apply) {
      googleOAuth = loadGoogleOAuthConfigFromEnv();
      if (!googleOAuth) {
        return NextResponse.json(
          { ok: false, error: "Google OAuth is not configured on Grapevine Prep." },
          { status: 500 },
        );
      }

      googleTokens = await loadGoogleTokensForUser(build.created_by);
      if (!googleTokens?.access_token && !googleTokens?.refresh_token) {
        return NextResponse.json(
          { ok: false, error: "Build author has no Google tokens for publish." },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      build,
      googleTokens,
      googleOAuth,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load run context.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
