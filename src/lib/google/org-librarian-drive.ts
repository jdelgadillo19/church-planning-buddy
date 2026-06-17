import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { googleConnected } from "@/app/api/auth/google/_session";
import type { drive_v3 } from "@/lib/google/api-types";
import { getAuthedClients } from "@/lib/google/auth";
import { loadGoogleTokensForUser } from "@/lib/google/token-store";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

/**
 * Org file librarian — Owner Google account proxies Drive reads/writes for volunteers.
 * Set PP_LIBRARIAN_USER_ID to the Supabase auth user id for sbblegacytech (or church Owner).
 */
export async function resolveOrgLibrarianUserId(orgId: string): Promise<string | null> {
  const fromEnv = process.env.PP_LIBRARIAN_USER_ID?.trim();
  if (fromEnv) return fromEnv;

  if (!isSupabaseAdminConfigured()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data?.[0]?.user_id) return null;
  return data[0].user_id as string;
}

export async function loadOrgLibrarianTokens(orgId: string): Promise<GoogleTokens | null> {
  const librarianId = await resolveOrgLibrarianUserId(orgId);
  if (!librarianId) return null;
  const tokens = await loadGoogleTokensForUser(librarianId);
  if (!googleConnected(tokens)) return null;
  return tokens;
}

export async function loadOrgLibrarianDrive(
  orgId: string,
): Promise<{ drive: drive_v3.Drive; tokens: GoogleTokens; librarianUserId: string } | null> {
  const librarianId = await resolveOrgLibrarianUserId(orgId);
  if (!librarianId) return null;
  const tokens = await loadGoogleTokensForUser(librarianId);
  if (!googleConnected(tokens)) return null;
  const { drive } = getAuthedClients(tokens!);
  return { drive, tokens: tokens!, librarianUserId: librarianId };
}
