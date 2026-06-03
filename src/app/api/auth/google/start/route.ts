import { NextResponse } from "next/server";
import { encodeOAuthState, sanitizeOAuthReturnTo } from "@/lib/google/oauth-return";
import { DRIVE_SCOPES, getOAuthClient } from "../_oauth";
import { getOrCreateSessionId } from "../_session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = sanitizeOAuthReturnTo(url.searchParams.get("returnTo"));

  const oauth2 = getOAuthClient();
  await getOrCreateSessionId();

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
    state: encodeOAuthState(returnTo),
  });

  return NextResponse.redirect(authUrl);
}

