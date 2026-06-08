import { getRigById } from "./rigs";
import { hashRigSecret, parseRigAuthorization } from "./rig-secret";
import { isMachineBearerAuthorized } from "@/lib/auth/machine-bearer";
import { touchRigLastSeen } from "./rigs";
import type { PpRigRow } from "./types";

export async function authenticateRigRequest(
  req: Request,
  expectedRigId?: string,
): Promise<PpRigRow | null> {
  const parsed = parseRigAuthorization(req.headers.get("authorization"));
  if (!parsed) return null;
  if (expectedRigId && parsed.rigId !== expectedRigId) return null;

  const rig = await getRigById(parsed.rigId);
  if (!rig || rig.status !== "active") return null;
  if (!rig.rig_secret_hash) return null;
  if (hashRigSecret(parsed.secret) !== rig.rig_secret_hash) return null;

  await touchRigLastSeen(rig.id);
  return rig;
}

/** Rig secret header OR legacy bootstrap bearer (Phase 0 transition). */
export async function authenticateRigOrBootstrap(
  req: Request,
  expectedRigId?: string,
): Promise<PpRigRow | null> {
  const rig = await authenticateRigRequest(req, expectedRigId);
  if (rig) return rig;
  if (isMachineBearerAuthorized(req) && expectedRigId) {
    const row = await getRigById(expectedRigId);
    if (row?.status === "active") {
      await touchRigLastSeen(row.id);
      return row;
    }
  }
  return null;
}

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
