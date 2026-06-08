import { isMachineBearerAuthorized, machineBearerToken } from "@/lib/auth/machine-bearer";

export function slideDeckAgentToken(): string | null {
  return machineBearerToken();
}

export function isSlideDeckAgentAuthorized(req: Request): boolean {
  return isMachineBearerAuthorized(req);
}
