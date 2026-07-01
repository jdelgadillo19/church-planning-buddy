import { createAdminClient } from "@/lib/supabase/admin";
import type { FilebasePullManifest } from "@/lib/google/filebase-pull";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import {
  generateRemotePrepClientToken,
  hashRemotePrepClientToken,
} from "@/lib/remote-prep/auth";
import type { RemotePrepProgress } from "@/lib/remote-prep/progress";

export type RemotePrepJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type RemotePrepJobRow = {
  id: string;
  org_id: string;
  user_id: string;
  plan_id: string;
  service_type_id: string | null;
  status: RemotePrepJobStatus;
  client_token_hash: string;
  commit_plan: MockCommitPlan;
  library_selections: Record<string, string>;
  pull_id: string | null;
  pull_file_name: string | null;
  pull_manifest: FilebasePullManifest | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  progress: RemotePrepProgress | null;
  cancel_requested_at: string | null;
  expires_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const JOB_TTL_MS = 60 * 60 * 1000;

export async function createRemotePrepJob(input: {
  orgId: string;
  userId: string;
  planId: string;
  serviceTypeId?: string;
  commitPlan: MockCommitPlan;
  librarySelections: Record<string, string>;
  pullId: string;
  pullFileName: string;
  pullManifest: FilebasePullManifest;
}): Promise<{ job: RemotePrepJobRow; clientToken: string }> {
  const admin = createAdminClient();
  const clientToken = generateRemotePrepClientToken();
  const expiresAt = new Date(Date.now() + JOB_TTL_MS).toISOString();

  const { data, error } = await admin
    .from("remote_prep_jobs")
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      plan_id: input.planId,
      service_type_id: input.serviceTypeId ?? null,
      status: "pending",
      client_token_hash: hashRemotePrepClientToken(clientToken),
      commit_plan: input.commitPlan,
      library_selections: input.librarySelections,
      pull_id: input.pullId,
      pull_file_name: input.pullFileName,
      pull_manifest: input.pullManifest,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create remote prep job.");
  }

  return { job: data as RemotePrepJobRow, clientToken };
}

export async function getRemotePrepJobById(jobId: string): Promise<RemotePrepJobRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("remote_prep_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RemotePrepJobRow | null) ?? null;
}

export async function authenticateRemotePrepJob(
  jobId: string,
  clientToken: string,
): Promise<RemotePrepJobRow | null> {
  const job = await getRemotePrepJobById(jobId);
  if (!job) return null;
  if (new Date(job.expires_at).getTime() < Date.now()) return null;
  const hash = hashRemotePrepClientToken(clientToken);
  if (hash !== job.client_token_hash) return null;
  return job;
}

export async function markRemotePrepJobRunning(jobId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("remote_prep_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["pending", "failed"]);
  if (error) throw new Error(error.message);
}

export async function completeRemotePrepJob(
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("remote_prep_jobs")
    .update({
      status: "completed",
      result,
      error_message: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function failRemotePrepJob(jobId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("remote_prep_jobs")
    .update({
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function updateRemotePrepProgress(
  jobId: string,
  progress: RemotePrepProgress,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("remote_prep_jobs")
    .update({
      progress,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function requestRemotePrepCancel(jobId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("remote_prep_jobs")
    .update({
      cancel_requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function isRemotePrepCancelRequested(jobId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("remote_prep_jobs")
    .select("cancel_requested_at, status")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  if (data.status === "cancelled") return true;
  return Boolean(data.cancel_requested_at);
}

export async function markRemotePrepJobCancelled(jobId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("remote_prep_jobs")
    .update({
      status: "cancelled",
      error_message: "Remote prep cancelled.",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export function buildRemotePrepDeepLink(input: {
  jobId: string;
  clientToken: string;
  origin?: string;
}): string {
  const qs = new URLSearchParams({
    jobId: input.jobId,
    token: input.clientToken,
  });
  return `grapevine://remote-prep?${qs.toString()}`;
}
