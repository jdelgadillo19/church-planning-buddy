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

export function encodeOAuthState(returnTo: string): string {
  return Buffer.from(JSON.stringify({ returnTo: sanitizeOAuthReturnTo(returnTo) }), "utf8").toString(
    "base64url",
  );
}

export function decodeOAuthState(state: string | null | undefined): string {
  if (!state?.trim()) return "/";
  try {
    const json = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      returnTo?: string;
    };
    return sanitizeOAuthReturnTo(json.returnTo);
  } catch {
    return "/";
  }
}
