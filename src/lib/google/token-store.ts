import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { refreshGoogleOAuthTokens } from "@/lib/google/oauth-exchange";
import { hasFullDriveScope } from "@/lib/google/token-info";

export type SaveGoogleTokensResult = {
  saved: boolean;
  error?: string;
};

export type SaveGoogleTokensOptions = {
  /** Connect Google — replace stored tokens instead of merging with Supabase login tokens. */
  replace?: boolean;
};

type StoredTokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  scopes: string[] | null;
  expires_at: string | null;
};

function scopesFromTokens(tokens: GoogleTokens): string[] {
  if (tokens.scope) {
    return tokens.scope.split(" ").filter(Boolean);
  }
  return [];
}

function rowToTokens(row: StoredTokenRow): GoogleTokens {
  return {
    access_token: row.access_token ?? undefined,
    refresh_token: row.refresh_token ?? undefined,
    scope: row.scopes?.join(" ") ?? undefined,
    expiry_date: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
  };
}

/** Preserve refresh_token (and other fields) when Google omits them on reconnect. */
export function mergeGoogleTokenFields(
  incoming: GoogleTokens,
  existing: GoogleTokens | null,
): GoogleTokens {
  return {
    access_token: incoming.access_token ?? existing?.access_token ?? undefined,
    refresh_token: incoming.refresh_token ?? existing?.refresh_token ?? undefined,
    scope: incoming.scope ?? existing?.scope ?? undefined,
    token_type: incoming.token_type ?? existing?.token_type ?? undefined,
    expiry_date: incoming.expiry_date ?? existing?.expiry_date ?? undefined,
  };
}

export function hasDriveScopeInTokens(tokens: GoogleTokens | null): boolean {
  const scopes = tokens?.scope?.split(" ").filter(Boolean) ?? [];
  if (scopes.length === 0) return false;
  return hasFullDriveScope(scopes);
}

async function fetchStoredTokenRow(userId: string): Promise<StoredTokenRow | null> {
  if (!isSupabaseAdminConfigured()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("oauth_tokens")
    .select("access_token, refresh_token, scopes, expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function refreshGoogleTokens(tokens: GoogleTokens): Promise<GoogleTokens | null> {
  if (!tokens.refresh_token) return null;
  try {
    return await refreshGoogleOAuthTokens(tokens.refresh_token);
  } catch {
    return null;
  }
}

export async function saveGoogleTokensForUser(
  userId: string,
  tokens: GoogleTokens,
  options?: SaveGoogleTokensOptions,
): Promise<SaveGoogleTokensResult> {
  if (!isSupabaseAdminConfigured()) {
    console.warn(
      "[token-store] SUPABASE_SERVICE_ROLE_KEY not configured — Google tokens not persisted to oauth_tokens",
    );
    return { saved: false, error: "admin_not_configured" };
  }

  const existingRow = options?.replace ? null : await fetchStoredTokenRow(userId);
  const merged = options?.replace
    ? tokens
    : mergeGoogleTokenFields(tokens, existingRow ? rowToTokens(existingRow) : null);

  if (!merged.access_token && !merged.refresh_token) {
    return { saved: false, error: "no_tokens" };
  }

  const admin = createAdminClient();
  const scopes = scopesFromTokens(merged);
  const expiresAt = merged.expiry_date ? new Date(merged.expiry_date).toISOString() : null;

  const { error } = await admin.from("oauth_tokens").upsert(
    {
      user_id: userId,
      provider: "google",
      access_token: merged.access_token ?? null,
      refresh_token: merged.refresh_token ?? null,
      expires_at: expiresAt,
      scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[token-store] save failed:", error.message);
    return { saved: false, error: error.message };
  }
  return { saved: true };
}

/** True when stored tokens look like a full Connect Google grant (not login-only). */
export async function hasAuthoritativeConnectGoogleTokens(userId: string): Promise<boolean> {
  const row = await fetchStoredTokenRow(userId);
  if (!row) return false;
  const tokens = rowToTokens(row);
  return Boolean(tokens.refresh_token && hasDriveScopeInTokens(tokens));
}

export async function loadGoogleTokensForUser(userId: string): Promise<GoogleTokens | null> {
  if (!isSupabaseAdminConfigured()) return null;

  const data = await fetchStoredTokenRow(userId);
  if (!data) return null;

  let tokens = rowToTokens(data);
  if (!tokens.access_token && !tokens.refresh_token) return null;

  const expiring = tokens.expiry_date != null && tokens.expiry_date < Date.now() + 60_000;
  if (expiring && tokens.refresh_token) {
    const refreshed = await refreshGoogleTokens(tokens);
    if (refreshed) {
      await saveGoogleTokensForUser(userId, refreshed);
      return refreshed;
    }
  }

  return tokens;
}

export async function clearGoogleTokensForUser(userId: string): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return false;

  const admin = createAdminClient();
  const { error } = await admin.from("oauth_tokens").delete().eq("user_id", userId);
  return !error;
}
