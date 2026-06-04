import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgMembership = {
  orgId: string;
  orgName: string;
  role: string;
};

/** Returns memberships for the signed-in user; empty if not invited to any org. */
export async function getUserMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrgMembership[]> {
  const { data, error } = await supabase
    .from("org_members")
    .select("role, organizations ( id, name )")
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const org = row.organizations as { id: string; name: string } | { id: string; name: string }[] | null;
    const o = Array.isArray(org) ? org[0] : org;
    if (!o?.id) return [];
    return [{ orgId: o.id, orgName: o.name, role: row.role as string }];
  });
}

export async function userHasOrgAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const memberships = await getUserMemberships(supabase, userId);
  return memberships.length > 0;
}
