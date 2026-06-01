import { google } from "googleapis";
import type { GoogleTokens } from "@/app/api/auth/google/_session";

function must(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function getOAuthClient() {
  const clientId = must("GOOGLE_CLIENT_ID");
  const clientSecret = must("GOOGLE_CLIENT_SECRET");
  const redirectUri = must("GOOGLE_REDIRECT_URI");
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthedClients(tokens: GoogleTokens) {
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  return {
    auth,
    drive: google.drive({ version: "v3", auth }),
    docs: google.docs({ version: "v1", auth }),
    sheets: google.sheets({ version: "v4", auth }),
    calendar: google.calendar({ version: "v3", auth }),
  };
}
