import type { SlideDeckManifest } from "@/lib/slide-deck/types";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { SlideDeckSubmissionRow } from "./types";

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
  playlistName: string;
};

export type CreateSubmissionInput = ServiceScope & {
  createdBy: string;
  commitPlan: MockCommitPlan;
  librarySelections?: Record<string, string>;
  manifest?: SlideDeckManifest | null;
  changeSummary?: string;
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
      playlist_name: input.playlistName,
      created_by: input.createdBy,
      commit_plan: input.commitPlan,
      library_selections: input.librarySelections ?? {},
      manifest: input.manifest ?? null,
      change_summary: input.changeSummary ?? null,
      status: "draft",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save submission.");
  }
  return data as SlideDeckSubmissionRow;
}

export async function listDraftSubmissionsForScope(
  scope: ServiceScope,
): Promise<SlideDeckSubmissionRow[]> {
  const supabase = requireAdmin();
  let query = supabase
    .from("slide_deck_submissions")
    .select("*")
    .eq("org_id", scope.orgId)
    .eq("plan_id", scope.planId)
    .eq("playlist_name", scope.playlistName)
    .eq("status", "draft")
    .order("created_at", { ascending: true });

  if (scope.serviceTypeId) {
    query = query.eq("service_type_id", scope.serviceTypeId);
  } else {
    query = query.is("service_type_id", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SlideDeckSubmissionRow[];
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
