import crypto from "node:crypto";
import { cookies } from "next/headers";

export type GoogleTokens = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

const COOKIE_NAME = "cpb_session";

const globalForSessions = globalThis as unknown as {
  __cpbSessions?: Map<string, GoogleTokens>;
};

function sessionStore() {
  if (!globalForSessions.__cpbSessions) globalForSessions.__cpbSessions = new Map();
  return globalForSessions.__cpbSessions;
}

export function getOrCreateSessionId() {
  const jar = cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = crypto.randomBytes(18).toString("base64url");
  jar.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return id;
}

export function saveTokensForCurrentSession(tokens: GoogleTokens) {
  const id = getOrCreateSessionId();
  sessionStore().set(id, tokens);
}

export function loadTokensForCurrentSession(): GoogleTokens | null {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (!id) return null;
  return sessionStore().get(id) ?? null;
}

