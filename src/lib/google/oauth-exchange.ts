import type { GoogleTokens } from "@/app/api/auth/google/_session";

function mustEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/** Exchange an authorization code via Google's token endpoint (Worker-safe fetch). */
export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: mustEnv("GOOGLE_CLIENT_ID"),
      client_secret: mustEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  let data: GoogleTokenResponse;
  try {
    data = (await res.json()) as GoogleTokenResponse;
  } catch {
    throw new Error(`token_response_not_json http_${res.status}`);
  }

  if (!res.ok) {
    const detail = data.error_description || data.error || `http_${res.status}`;
    throw new Error(detail);
  }

  if (!data.access_token && !data.refresh_token) {
    throw new Error("token_response_empty");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    scope: data.scope,
    token_type: data.token_type,
    expiry_date:
      typeof data.expires_in === "number" && data.expires_in > 0
        ? Date.now() + data.expires_in * 1000
        : undefined,
  };
}

/** Refresh tokens via Google's token endpoint (Worker-safe fetch). */
export async function refreshGoogleOAuthTokens(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: mustEnv("GOOGLE_CLIENT_ID"),
      client_secret: mustEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  let data: GoogleTokenResponse;
  try {
    data = (await res.json()) as GoogleTokenResponse;
  } catch {
    throw new Error(`refresh_response_not_json http_${res.status}`);
  }

  if (!res.ok) {
    const detail = data.error_description || data.error || `http_${res.status}`;
    throw new Error(detail);
  }

  if (!data.access_token) {
    throw new Error("refresh_response_empty");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    scope: data.scope,
    token_type: data.token_type,
    expiry_date:
      typeof data.expires_in === "number" && data.expires_in > 0
        ? Date.now() + data.expires_in * 1000
        : undefined,
  };
}
