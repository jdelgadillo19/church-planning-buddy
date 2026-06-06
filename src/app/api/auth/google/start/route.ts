import { NextResponse } from "next/server";
import { encodeLegacyOAuthState, encodeOAuthState, sanitizeOAuthReturnTo } from "@/lib/google/oauth-return";
import { googleOAuthRedirectUri, getOAuthClient } from "@/lib/google/auth";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { DRIVE_SCOPES } from "../_oauth";
import { getOrCreateSessionId } from "../_session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = sanitizeOAuthReturnTo(url.searchParams.get("returnTo"));

  const supabase = await createClientIfConfigured();
  if (!supabase || !isGrapevineAuthEnabled()) {
    const redirectUri = googleOAuthRedirectUri(url.origin);
    const oauth2 = getOAuthClient(redirectUri);
    await getOrCreateSessionId();

    const authUrl = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: DRIVE_SCOPES,
      redirect_uri: redirectUri,
      state: encodeLegacyOAuthState(returnTo),
    });

    return NextResponse.redirect(authUrl);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("next", returnTo);
    return NextResponse.redirect(login);
  }

  const redirectUri = googleOAuthRedirectUri(url.origin);
  const oauth2 = getOAuthClient(redirectUri);
  await getOrCreateSessionId();

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
    redirect_uri: redirectUri,
    state: encodeOAuthState(returnTo, user.id),
  });

  return NextResponse.redirect(authUrl);
}
