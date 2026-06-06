import crypto from "node:crypto";

/** Safe same-origin return path after Google OAuth (state param). */
export function sanitizeOAuthReturnTo(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "/";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") return "/";
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return "/";
  }
}

const STATE_TTL_MS = 15 * 60 * 1000;

export type DecodedOAuthState = {
  returnTo: string;
  userId?: string;
};

function oauthStateSecret(): string {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) {
    throw new Error("OAuth state signing secret not configured");
  }
  return secret;
}

function signOAuthPayload(payload: { returnTo: string; userId: string; ts: number }): string {
  const body = JSON.stringify(payload);
  return crypto.createHmac("sha256", oauthStateSecret()).update(body).digest("base64url");
}

/** Unsigned state for local dev without Supabase auth. */
export function encodeLegacyOAuthState(returnTo: string): string {
  return Buffer.from(JSON.stringify({ returnTo: sanitizeOAuthReturnTo(returnTo) }), "utf8").toString(
    "base64url",
  );
}

/** Signed OAuth state — binds Supabase user id for callback save on Cloudflare Workers. */
export function encodeOAuthState(returnTo: string, userId: string): string {
  const payload = {
    returnTo: sanitizeOAuthReturnTo(returnTo),
    userId,
    ts: Date.now(),
  };
  const sig = signOAuthPayload(payload);
  return Buffer.from(JSON.stringify({ ...payload, sig }), "utf8").toString("base64url");
}

export function decodeOAuthState(state: string | null | undefined): DecodedOAuthState {
  if (!state?.trim()) return { returnTo: "/" };
  try {
    const json = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      returnTo?: string;
      userId?: string;
      ts?: number;
      sig?: string;
    };

    if (!json.sig) {
      return { returnTo: sanitizeOAuthReturnTo(json.returnTo) };
    }

    if (!json.userId || json.ts == null || !json.sig) {
      return { returnTo: "/" };
    }

    if (Date.now() - json.ts > STATE_TTL_MS) {
      return { returnTo: "/" };
    }

    const returnTo = sanitizeOAuthReturnTo(json.returnTo);
    const payload = { returnTo, userId: json.userId, ts: json.ts };
    const expected = signOAuthPayload(payload);
    if (json.sig !== expected) {
      return { returnTo: "/" };
    }

    return { returnTo, userId: json.userId };
  } catch {
    return { returnTo: "/" };
  }
}

/** Sanitize save error for URL query param (no secrets). */
export function sanitizeGoogleErrorParam(error?: string): string {
  if (!error?.trim()) return "unknown";
  return error.trim().slice(0, 120).replace(/[^\w\s.-]/g, "_");
}
