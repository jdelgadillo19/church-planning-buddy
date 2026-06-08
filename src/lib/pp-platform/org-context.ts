import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserMemberships, type OrgMembership } from "@/lib/supabase/membership";

export async function resolveUserOrg(
  supabase: SupabaseClient,
  userId: string,
  preferredOrgId?: string,
): Promise<OrgMembership | null> {
  const memberships = await getUserMemberships(supabase, userId);
  if (memberships.length === 0) return null;
  if (preferredOrgId) {
    const match = memberships.find((m) => m.orgId === preferredOrgId);
    if (match) return match;
  }
  return memberships[0] ?? null;
}

export function canQueueBuilds(role: string): boolean {
  return role === "admin" || role === "planner";
}
