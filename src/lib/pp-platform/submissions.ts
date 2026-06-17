import type { HandoffStatus } from "./types";
import { randomUUID } from "node:crypto";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { MissingElement, MissingFileRef } from "@/lib/slide-deck/handoff";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { SlideDeckSubmissionRow } from "./types";

function resolveRigHandoffStatus(input: {
  handoffStatus: HandoffStatus | null | undefined;
  adminApprovedForRig: boolean;
}): "pending" | "awaiting_approval" | null {
  if (!input.handoffStatus) return null;
  if (input.handoffStatus === "incomplete") return "pending";
  if (input.handoffStatus === "complete") {
    return input.adminApprovedForRig ? "pending" : "awaiting_approval";
  }
  return null;
}

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createAdminClient();
}

export type ServiceScope = {
  orgId: string;
  planId: string;
  serviceTypeId?: string | null;
  playlistName?: string;
};

export type CreateSubmissionInput = ServiceScope & {
  createdBy: string;
  commitPlan: MockCommitPlan;
  librarySelections?: Record<string, string>;
  manifest?: SlideDeckManifest | null;
  changeSummary?: string;
  handoffStatus?: HandoffStatus | null;
  missingElements?: MissingElement[];
  missingFiles?: MissingFileRef[];
  parentHandoffId?: string | null;
  presentationInstanceId?: string;
  rigHandoffStatus?: "pending" | "synced" | "skipped" | "awaiting_approval" | null;
  replaceOnRig?: boolean;
  adminApprovedForRig?: boolean;
  versionLabel?: string | null;
};

export async function createSlideDeckSubmission(
  input: CreateSubmissionInput,
): Promise<SlideDeckSubmissionRow> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_submissions")
    .insert({
      org_id: input.orgId,
      plan_id: input.planId,
      service_type_id: input.serviceTypeId ?? null,
      playlist_name: input.playlistName ?? input.commitPlan.playlistName,
      created_by: input.createdBy,
      commit_plan: input.commitPlan,
      library_selections: input.librarySelections ?? {},
      manifest: input.manifest ?? null,
      change_summary: input.changeSummary ?? null,
      status: "draft",
      handoff_status: input.handoffStatus ?? null,
      missing_elements: input.missingElements ?? [],
      missing_files: input.missingFiles ?? [],
      parent_handoff_id: input.parentHandoffId ?? null,
      presentation_instance_id: input.presentationInstanceId ?? randomUUID(),
      replace_on_rig: input.replaceOnRig ?? false,
      admin_approved_for_rig: input.adminApprovedForRig ?? false,
      version_label: input.versionLabel ?? null,
      rig_handoff_status:
        input.rigHandoffStatus !== undefined
          ? input.rigHandoffStatus
          : resolveRigHandoffStatus({
              handoffStatus: input.handoffStatus,
              adminApprovedForRig: input.adminApprovedForRig ?? false,
            }),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save submission.");
  }
  return data as SlideDeckSubmissionRow;
}

function scopeQuery(
  supabase: ReturnType<typeof requireAdmin>,
  scope: ServiceScope,
  handoffsOnly: boolean,
) {
  let query = supabase
    .from("slide_deck_submissions")
    .select("*")
    .eq("org_id", scope.orgId)
    .eq("plan_id", scope.planId)
    .eq("status", "draft")
    .order("created_at", { ascending: true });

  if (scope.playlistName) {
    query = query.eq("playlist_name", scope.playlistName);
  }
  if (scope.serviceTypeId) {
    query = query.eq("service_type_id", scope.serviceTypeId);
  } else {
    query = query.is("service_type_id", null);
  }
  if (handoffsOnly) {
    query = query.not("handoff_status", "is", null);
  } else {
    query = query.is("handoff_status", null);
  }
  return query;
}

export async function listDraftSubmissionsForScope(
  scope: ServiceScope,
): Promise<SlideDeckSubmissionRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await scopeQuery(supabase, scope, false);
  if (error) throw new Error(error.message);
  return (data ?? []) as SlideDeckSubmissionRow[];
}

export async function listHandoffsForPlan(scope: ServiceScope): Promise<SlideDeckSubmissionRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await scopeQuery(supabase, scope, true);
  if (error) throw new Error(error.message);
  return (data ?? []) as SlideDeckSubmissionRow[];
}

export async function getHandoffById(handoffId: string): Promise<SlideDeckSubmissionRow | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_submissions")
    .select("*")
    .eq("id", handoffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SlideDeckSubmissionRow | null) ?? null;
}

export async function listPendingRigHandoffs(orgId: string): Promise<SlideDeckSubmissionRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_submissions")
    .select("*")
    .eq("org_id", orgId)
    .eq("rig_handoff_status", "pending")
    .not("handoff_status", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SlideDeckSubmissionRow[];
  return rows.filter(
    (h) =>
      h.handoff_status === "incomplete" ||
      (h.handoff_status === "complete" && h.admin_approved_for_rig),
  );
}

export async function listHandoffsAwaitingAdminApproval(
  orgId: string,
): Promise<SlideDeckSubmissionRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_submissions")
    .select("*")
    .eq("org_id", orgId)
    .eq("rig_handoff_status", "awaiting_approval")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SlideDeckSubmissionRow[];
}

export async function approveHandoffForRig(handoffId: string): Promise<SlideDeckSubmissionRow> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_submissions")
    .update({
      admin_approved_for_rig: true,
      rig_handoff_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", handoffId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to approve handoff.");
  return data as SlideDeckSubmissionRow;
}

export async function markHandoffRigStatus(
  handoffId: string,
  status: "synced" | "skipped",
  patch?: { servicesPackageId?: string; servicesDriveUrl?: string },
): Promise<void> {
  const supabase = requireAdmin();
  const { error } = await supabase
    .from("slide_deck_submissions")
    .update({
      rig_handoff_status: status,
      services_package_id: patch?.servicesPackageId ?? undefined,
      services_drive_url: patch?.servicesDriveUrl ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", handoffId);
  if (error) throw new Error(error.message);
}

export async function markSubmissionsMerged(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = requireAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("slide_deck_submissions")
    .update({ status: "merged", updated_at: now })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function markSubmissionsSuperseded(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = requireAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("slide_deck_submissions")
    .update({ status: "superseded", updated_at: now })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export function submissionToMergeInput(row: SlideDeckSubmissionRow) {
  return {
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    commitPlan: row.commit_plan,
    librarySelections: row.library_selections ?? {},
  };
}
