import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { probeGoogleDriveAccess } from "@/lib/google/drive-probe";
import { hasDriveScopeInTokens } from "@/lib/google/token-store";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { googleConnected, loadTokensForCurrentSession } from "../_session";

export async function GET() {
  const tokens = await loadTokensForCurrentSession();
  const connected = googleConnected(tokens);
  const storedHasDriveScope = hasDriveScopeInTokens(tokens);

  let sessionUserPresent = false;
  const supabase = await createClientIfConfigured();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    sessionUserPresent = Boolean(user);
  }

  let driveProbeOk = false;
  if (connected && tokens) {
    try {
      const probe = await probeGoogleDriveAccess(tokens);
      driveProbeOk = probe.ok;
    } catch {
      driveProbeOk = false;
    }
  }

  return NextResponse.json({
    ok: true,
    connected,
    scopes: tokens?.scope?.split(" ").filter(Boolean) ?? [],
    adminConfigured: isSupabaseAdminConfigured(),
    sessionUserPresent,
    hasRefreshToken: Boolean(tokens?.refresh_token),
    storedHasDriveScope,
    driveProbeOk,
    hasDriveScope: storedHasDriveScope && driveProbeOk,
  });
}
