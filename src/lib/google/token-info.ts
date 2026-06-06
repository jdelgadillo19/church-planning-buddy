export type GoogleTokenInfo = {
  email?: string;
  scopes: string[];
};

/** Live scopes on the access token (Google tokeninfo — not stored DB scopes). */
export async function fetchGoogleTokenInfo(accessToken: string): Promise<GoogleTokenInfo> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!res.ok) return { scopes: [] };
    const data = (await res.json()) as { email?: string; scope?: string };
    return {
      email: data.email,
      scopes: data.scope?.split(" ").filter(Boolean) ?? [],
    };
  } catch {
    return { scopes: [] };
  }
}

/** Full Drive access (not per-file `drive.file`). */
export function hasFullDriveScope(scopes: string[]): boolean {
  return scopes.some(
    (s) =>
      s === "https://www.googleapis.com/auth/drive" ||
      s === "https://www.googleapis.com/auth/drive.readonly",
  );
}

export function hasDriveFileScopeOnly(scopes: string[]): boolean {
  return scopes.some((s) => s.includes("/auth/drive.file")) && !hasFullDriveScope(scopes);
}
