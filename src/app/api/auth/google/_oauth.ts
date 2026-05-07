import { google } from "googleapis";

function must(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

export function getOAuthClient() {
  const clientId = must("GOOGLE_CLIENT_ID");
  const clientSecret = must("GOOGLE_CLIENT_SECRET");
  const redirectUri = must("GOOGLE_REDIRECT_URI");
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
];

