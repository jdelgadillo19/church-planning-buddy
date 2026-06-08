import { createHash, randomBytes } from "node:crypto";

export function generateRigSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashRigSecret(secret: string): string {
  return createHash("sha256").update(secret.trim()).digest("hex");
}

export function parseRigAuthorization(header: string | null): {
  rigId: string;
  secret: string;
} | null {
  const trimmed = header?.trim() ?? "";
  if (!trimmed.toLowerCase().startsWith("rig ")) return null;
  const rest = trimmed.slice(4).trim();
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const rigId = rest.slice(0, colon).trim();
  const secret = rest.slice(colon + 1).trim();
  if (!rigId || !secret) return null;
  return { rigId, secret };
}
