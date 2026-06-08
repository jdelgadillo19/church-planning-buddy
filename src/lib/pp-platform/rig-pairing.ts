import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { generateRigSecret, hashRigSecret } from "./rig-secret";
import type { PpRigRow } from "./types";

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createAdminClient();
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function createPairingCode(input: {
  orgId: string;
  createdBy: string;
  ttlMinutes?: number;
}): Promise<{ code: string; expiresAt: string }> {
  const supabase = requireAdmin();
  const ttl = input.ttlMinutes ?? 15;
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await supabase.from("pp_rig_pairing_codes").insert({
      org_id: input.orgId,
      code,
      created_by: input.createdBy,
      expires_at: expiresAt,
    });
    if (!error) return { code, expiresAt };
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("Failed to generate unique pairing code.");
}

export async function pairRigWithCode(input: {
  code: string;
  displayName: string;
  deviceFingerprint?: string;
  publicKey?: string;
}): Promise<{ rig: PpRigRow; rigSecret: string }> {
  const supabase = requireAdmin();
  const normalized = input.code.trim().toUpperCase();
  const rigSecret = generateRigSecret();
  const now = new Date().toISOString();

  const { data: pairing, error: findError } = await supabase
    .from("pp_rig_pairing_codes")
    .select("*")
    .eq("code", normalized)
    .is("used_at", null)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (!pairing) throw new Error("Invalid or expired pairing code.");
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    throw new Error("Pairing code expired.");
  }

  const { data: rig, error: rigError } = await supabase
    .from("pp_rigs")
    .insert({
      org_id: pairing.org_id,
      display_name: input.displayName.trim() || "Presentation rig",
      device_fingerprint: input.deviceFingerprint?.trim() || null,
      public_key: input.publicKey?.trim() || "paired",
      rig_secret_hash: hashRigSecret(rigSecret),
      status: "active",
      last_seen_at: now,
      paired_by: pairing.created_by,
    })
    .select("*")
    .single();

  if (rigError || !rig) throw new Error(rigError?.message ?? "Failed to register rig.");

  await supabase
    .from("pp_rig_pairing_codes")
    .update({ used_at: now, used_by_rig_id: rig.id })
    .eq("id", pairing.id);

  return { rig: rig as PpRigRow, rigSecret };
}
