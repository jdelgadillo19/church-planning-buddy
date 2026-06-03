import { NextResponse } from "next/server";
import { decodeOAuthState } from "@/lib/google/oauth-return";
import { getOAuthClient } from "../_oauth";
import { saveTokensForCurrentSession } from "../_session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnTo = decodeOAuthState(url.searchParams.get("state"));

  if (!code) {
    const missing = new URL(returnTo, url.origin);
    missing.searchParams.set("google", "missing_code");
    return NextResponse.redirect(missing);
  }

  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  await saveTokensForCurrentSession({
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    scope: tokens.scope ?? undefined,
    token_type: tokens.token_type ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  });

  const dest = new URL(returnTo, url.origin);
  dest.searchParams.set("google", "connected");
  return NextResponse.redirect(dest);
}

