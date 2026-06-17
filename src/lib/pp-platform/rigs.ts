import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isPresentationRigKind } from "@/lib/slide-deck/device-context";
import type { PpRigRow } from "./types";

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createAdminClient();
}

export async function getRigById(rigId: string): Promise<PpRigRow | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase.from("pp_rigs").select("*").eq("id", rigId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PpRigRow | null;
}

export async function listRigsForOrg(orgId: string): Promise<PpRigRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("pp_rigs")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PpRigRow[];
}

export async function listPresentationRigsForOrg(orgId: string): Promise<PpRigRow[]> {
  const rigs = await listRigsForOrg(orgId);
  return rigs.filter((r) => isPresentationRigKind(r.rig_kind));
}

export async function countActivePresentationRigs(orgId: string): Promise<number> {
  const presentation = await listPresentationRigsForOrg(orgId);
  return presentation.length;
}

export async function upsertBootstrapRig(input: {
  orgId: string;
  displayName: string;
  deviceFingerprint?: string;
  publicKey?: string;
  pairedBy?: string;
}): Promise<PpRigRow> {
  const supabase = requireAdmin();
  const fingerprint = input.deviceFingerprint?.trim() || "bootstrap";
  const publicKey = input.publicKey?.trim() || "bootstrap";

  const { data: existing } = await supabase
    .from("pp_rigs")
    .select("*")
    .eq("org_id", input.orgId)
    .eq("device_fingerprint", fingerprint)
    .eq("status", "active")
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from("pp_rigs")
      .update({
        display_name: input.displayName,
        last_seen_at: now,
        public_key: publicKey,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to update rig.");
    return data as PpRigRow;
  }

  const { data, error } = await supabase
    .from("pp_rigs")
    .insert({
      org_id: input.orgId,
      display_name: input.displayName,
      device_fingerprint: fingerprint,
      public_key: publicKey,
      rig_kind: "bootstrap",
      status: "active",
      last_seen_at: now,
      paired_by: input.pairedBy ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to register rig.");
  }
  return data as PpRigRow;
}

export async function touchRigLastSeen(rigId: string): Promise<void> {
  const supabase = requireAdmin();
  await supabase
    .from("pp_rigs")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", rigId);
}
