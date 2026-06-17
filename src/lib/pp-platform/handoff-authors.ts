import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export type HandoffAuthorLabel = {
  userId: string;
  email: string | null;
  displayName: string;
};

/** Resolve submitter labels for handoff discovery UI. */
export async function resolveHandoffAuthorLabels(
  userIds: string[],
): Promise<Record<string, HandoffAuthorLabel>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const out: Record<string, HandoffAuthorLabel> = {};
  if (unique.length === 0 || !isSupabaseAdminConfigured()) return out;

  const admin = createAdminClient();
  await Promise.all(
    unique.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) {
        out[userId] = { userId, email: null, displayName: userId.slice(0, 8) };
        return;
      }
      const email = data.user.email ?? null;
      const meta = data.user.user_metadata as Record<string, unknown> | undefined;
      const name =
        (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta?.name === "string" && meta.name.trim()) ||
        email ||
        userId.slice(0, 8);
      out[userId] = { userId, email, displayName: name };
    }),
  );
  return out;
}
