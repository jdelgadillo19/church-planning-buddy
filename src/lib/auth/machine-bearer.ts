/** Shared secret for rig bootstrap + legacy slide-deck agent (Phase 0). */
export function machineBearerToken(): string | null {
  return process.env.SLIDE_DECK_AGENT_TOKEN?.trim() || null;
}

export function isMachineBearerAuthorized(req: Request): boolean {
  const expected = machineBearerToken();
  if (!expected) return false;
  const header = req.headers.get("authorization")?.trim() ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  return token.length > 0 && token === expected;
}

/** API routes that accept machine bearer without a browser session. */
export function isMachineBearerApiPath(pathname: string): boolean {
  return (
    pathname === "/api/pp/rigs/bootstrap" ||
    pathname.startsWith("/api/slide-deck/agent/")
  );
}
