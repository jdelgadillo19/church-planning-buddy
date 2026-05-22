import { NextResponse } from "next/server";
import { DRIVE_SCOPES, getOAuthClient } from "../_oauth";
import { getOrCreateSessionId } from "../_session";

export async function GET() {
  const oauth2 = getOAuthClient();
  await getOrCreateSessionId();

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
  });

  return NextResponse.redirect(url);
}

