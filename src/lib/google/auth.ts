import { OAuth2Client } from "google-auth-library";
import { drive as driveApi } from "@googleapis/drive";
import { docs as docsApi } from "@googleapis/docs";
import { sheets as sheetsApi } from "@googleapis/sheets";
import { calendar as calendarApi } from "@googleapis/calendar";
import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { GOOGLE_SCOPES } from "@/lib/google/scopes";

export { GOOGLE_SCOPES };
export type { OAuth2Client };

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
};

function must(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

/** Server / rig worker — OAuth app credentials (not user tokens). */
export function loadGoogleOAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim();
  return redirectUri ? { clientId, clientSecret, redirectUri } : { clientId, clientSecret };
}

/**
 * OAuth redirect for Connect Google.
 * Prefer GOOGLE_REDIRECT_URI when set (production Worker) so www/apex browsing does not
 * produce a different redirect than Google Cloud / token exchange expect.
 */
export function googleOAuthRedirectUri(origin: string): string {
  const fromEnv = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (fromEnv?.startsWith("http")) return fromEnv;
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function getOAuthClient(redirectUri?: string, oauth?: GoogleOAuthConfig): OAuth2Client {
  if (oauth) {
    return new OAuth2Client({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      redirectUri: oauth.redirectUri ?? redirectUri,
    });
  }
  return new OAuth2Client({
    clientId: must("GOOGLE_CLIENT_ID"),
    clientSecret: must("GOOGLE_CLIENT_SECRET"),
    redirectUri: redirectUri ?? must("GOOGLE_REDIRECT_URI"),
  });
}

export function getAuthedClients(tokens: GoogleTokens, oauth?: GoogleOAuthConfig) {
  const auth = getOAuthClient(undefined, oauth);
  auth.setCredentials(tokens);
  return {
    auth,
    drive: driveApi({ version: "v3", auth }),
    docs: docsApi({ version: "v1", auth }),
    sheets: sheetsApi({ version: "v4", auth }),
    calendar: calendarApi({ version: "v3", auth }),
  };
}
