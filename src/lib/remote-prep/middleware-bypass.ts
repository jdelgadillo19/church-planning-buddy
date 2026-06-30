import { parseRemotePrepAuthorization } from "@/lib/remote-prep/auth";

/** Edge-safe remote prep client route checks (for middleware only). */

export function isRemotePrepClientApiPath(pathname: string): boolean {
  return /^\/api\/remote-prep\/jobs\/[^/]+(\/run-context|\/pull)?$/.test(pathname);
}

export function isRemotePrepClientBypassRequest(req: Request, pathname: string): boolean {
  if (!isRemotePrepClientApiPath(pathname)) return false;
  return parseRemotePrepAuthorization(req.headers.get("authorization")) !== null;
}
