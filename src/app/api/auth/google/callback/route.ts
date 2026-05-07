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
  saveTokensForCurrentSession(tokens);

  return NextResponse.redirect(new URL("/?google=connected", url.origin));
}

