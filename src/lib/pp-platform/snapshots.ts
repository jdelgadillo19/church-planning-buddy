import type { BundleSnapshot } from "@/lib/propresenter/bundle-sync/types";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { PpIndexSnapshotRow } from "./types";

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createAdminClient();
}

export async function insertIndexSnapshot(input: {
  orgId: string;
  rigId: string;
  snapshot: BundleSnapshot;
  deltaFromSnapshotId?: string;
}): Promise<PpIndexSnapshotRow> {
  const supabase = requireAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pp_index_snapshots")
    .insert({
      org_id: input.orgId,
      rig_id: input.rigId,
      snapshot_at: input.snapshot.createdAt || now,
      schema_version: input.snapshot.schemaVersion,
      index_json: input.snapshot,
      delta_from_snapshot_id: input.deltaFromSnapshotId ?? null,
      file_count: input.snapshot.files.length,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save index snapshot.");
  }
  return data as PpIndexSnapshotRow;
}

export async function getLatestSnapshotForOrg(orgId: string): Promise<PpIndexSnapshotRow | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("pp_index_snapshots")
    .select("*")
    .eq("org_id", orgId)
    .order("snapshot_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return row ? (row as PpIndexSnapshotRow) : null;
}
