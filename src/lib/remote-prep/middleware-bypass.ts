/** Edge-safe remote prep client route checks (for middleware only). */

export function isRemotePrepClientApiPath(pathname: string): boolean {
  return /^\/api\/remote-prep\/jobs\/[^/]+(\/run-context|\/pull)?$/.test(pathname);
}

export function parseRemotePrepAuthorization(header: string | null): {
  jobId: string;
  token: string;
} | null {
  const raw = header?.trim() ?? "";
  const match = /^RemotePrep\s+([^:\s]+):(.+)$/i.exec(raw);
  if (!match) return null;
  const jobId = match[1]?.trim();
  const token = match[2]?.trim();
  if (!jobId || !token) return null;
  return { jobId, token };
}

export function isRemotePrepClientBypassRequest(req: Request, pathname: string): boolean {
  if (!isRemotePrepClientApiPath(pathname)) return false;
  return parseRemotePrepAuthorization(req.headers.get("authorization")) !== null;
}
