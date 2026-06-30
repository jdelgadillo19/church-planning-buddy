import { createHash, randomBytes } from "node:crypto";

export function generateRemotePrepClientToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashRemotePrepClientToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
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

export function remotePrepAuthorization(jobId: string, token: string): string {
  return `RemotePrep ${jobId}:${token}`;
}
