import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasAuthoritativeConnectGoogleTokens } from "@/lib/google/token-store";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      const { session } = data;

      const dest = new URL(`${origin}${next.startsWith("/") ? next : "/"}`, origin);

      const keepDriveTokens = await hasAuthoritativeConnectGoogleTokens(session.user.id);
      if (!keepDriveTokens) {
        // Supabase provider_token does not reliably grant Shared-drive API access.
        // Drive workflows use Connect Google (/api/auth/google/start) instead.
        dest.searchParams.set("google", "reauth_required");
      }
      return NextResponse.redirect(dest.toString());
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
