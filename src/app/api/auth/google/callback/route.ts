import { NextResponse } from "next/server";
import { getOAuthClient } from "../_oauth";
import { saveTokensForCurrentSession } from "../_session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?google=missing_code", url.origin));
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

  return NextResponse.redirect(new URL("/?google=connected", url.origin));
}

