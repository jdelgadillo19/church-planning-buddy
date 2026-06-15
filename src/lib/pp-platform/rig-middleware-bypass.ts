import { isMachineBearerAuthorized } from "@/lib/auth/machine-bearer";

/** Edge-safe rig route checks (no node:crypto — for middleware only). */

export function isRigMachineApiPath(pathname: string): boolean {
  if (pathname === "/api/pp/rigs/pair") return true;
  return /^\/api\/pp\/rigs\/[^/]+\/(builds|snapshots)/.test(pathname);
}

export function isRigMachineBypassRequest(req: Request, pathname: string): boolean {
  if (pathname === "/api/pp/rigs/pair") return true;
  if (!isRigMachineApiPath(pathname)) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  return auth.toLowerCase().startsWith("rig ") || isMachineBearerAuthorized(req);
}
