/**
 * Write-safety policy for ProPresenter Local API.
 * MVP: read-only by default; destructive library sync paths are never allowed.
 */

/** Library write paths blocked — rig filebase wipe risk; GET enumeration is allowed. */
const LIBRARY_WRITE_BLOCKED_PREFIXES = ["v1/libraries", "v1/library/"] as const;

/** Paths that may be used only when PP_ALLOW_WRITES=true (spike / signed-off apply). */
const WRITE_ALLOWLIST: { method: string; pathPrefix: string }[] = [
  { method: "POST", pathPrefix: "v1/playlists" },
  { method: "POST", pathPrefix: "v1/playlist/" },
  { method: "PUT", pathPrefix: "v1/playlist/" },
];

export function normalizePpPath(path: string): string {
  return path.replace(/^\//, "").split("?")[0] ?? path;
}

export function isBlockedLibraryWrite(path: string, method: string): boolean {
  if (!isWriteMethod(method)) return false;
  const p = normalizePpPath(path);
  return LIBRARY_WRITE_BLOCKED_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix),
  );
}

export function isWriteMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

export function isWriteAllowed(
  path: string,
  method: string,
  allowWrites: boolean,
): { allowed: boolean; reason?: string } {
  const p = normalizePpPath(path);
  if (isBlockedLibraryWrite(p, method)) {
    return { allowed: false, reason: "Library write blocked (filebase wipe risk)." };
  }
  if (!isWriteMethod(method)) {
    return { allowed: true };
  }
  if (!allowWrites) {
    return { allowed: false, reason: "Writes disabled (set PP_ALLOW_WRITES=true for spike only)." };
  }
  const m = method.toUpperCase();
  const match = WRITE_ALLOWLIST.some((e) => m === e.method && (p === e.pathPrefix || p.startsWith(e.pathPrefix)));
  if (!match) {
    return { allowed: false, reason: `Write not on allowlist: ${m} ${p}` };
  }
  return { allowed: true };
}

export function assertPpRequestAllowed(
  path: string,
  method: string,
  allowWrites: boolean,
): void {
  const check = isWriteAllowed(path, method, allowWrites);
  if (!check.allowed) {
    throw new Error(check.reason ?? "ProPresenter write not allowed.");
  }
}
