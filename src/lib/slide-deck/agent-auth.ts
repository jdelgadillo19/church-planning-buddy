export function slideDeckAgentToken(): string | null {
  return process.env.SLIDE_DECK_AGENT_TOKEN?.trim() || null;
}

export function isSlideDeckAgentAuthorized(req: Request): boolean {
  const expected = slideDeckAgentToken();
  if (!expected) return false;
  const header = req.headers.get("authorization")?.trim() ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  return token.length > 0 && token === expected;
}
