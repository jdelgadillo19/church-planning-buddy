import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { ApplyCommitResult } from "@/lib/slide-deck/apply-commit";
import type { SlideDeckPublishResult } from "@/lib/slide-deck/publish-types";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export type SlideDeckJobStatus = "pending" | "claimed" | "completed" | "failed" | "cancelled";

export type SlideDeckJobRow = {
  id: string;
  user_id: string;
  plan_id: string;
  service_type_id: string | null;
  status: SlideDeckJobStatus;
  commit_plan: MockCommitPlan;
  library_selections: Record<string, string>;
  resolution: string | null;
  publish_after_apply: boolean;
  result: {
    apply?: ApplyCommitResult;
    publish?: SlideDeckPublishResult;
  } | null;
  error_message: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateSlideDeckJobInput = {
  userId: string;
  planId: string;
  serviceTypeId?: string;
  commitPlan: MockCommitPlan;
  librarySelections?: Record<string, string>;
  resolution?: "overwrite";
  publishAfterApply?: boolean;
};

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createAdminClient();
}

export async function createSlideDeckJob(input: CreateSlideDeckJobInput): Promise<SlideDeckJobRow> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_jobs")
    .insert({
      user_id: input.userId,
      plan_id: input.planId,
      service_type_id: input.serviceTypeId ?? null,
      commit_plan: input.commitPlan,
      library_selections: input.librarySelections ?? {},
      resolution: input.resolution ?? null,
      publish_after_apply: input.publishAfterApply !== false,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create slide deck job.");
  }
  return data as SlideDeckJobRow;
}

export async function listSlideDeckJobsForUser(
  userId: string,
  limit = 10,
): Promise<SlideDeckJobRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as SlideDeckJobRow[];
}

export async function claimNextPendingJob(): Promise<SlideDeckJobRow | null> {
  const supabase = requireAdmin();
  const { data: pending, error: listError } = await supabase
    .from("slide_deck_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (listError) throw new Error(listError.message);
  const job = (pending ?? [])[0] as SlideDeckJobRow | undefined;
  if (!job) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("slide_deck_jobs")
    .update({ status: "claimed", claimed_at: now, updated_at: now })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error || !data) return null;
  return data as SlideDeckJobRow;
}

export async function completeSlideDeckJob(
  jobId: string,
  result: SlideDeckJobRow["result"],
): Promise<SlideDeckJobRow> {
  const supabase = requireAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("slide_deck_jobs")
    .update({
      status: "completed",
      result,
      completed_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to complete job.");
  return data as SlideDeckJobRow;
}

export async function failSlideDeckJob(jobId: string, message: string): Promise<SlideDeckJobRow> {
  const supabase = requireAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("slide_deck_jobs")
    .update({
      status: "failed",
      error_message: message,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to mark job failed.");
  return data as SlideDeckJobRow;
}
