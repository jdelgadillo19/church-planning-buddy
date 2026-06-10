import { loadGoogleTokensForUser } from "@/lib/google/token-store";
import { runSlideDeckBuild } from "@/lib/slide-deck/run-build";
import type { SlideDeckJobRow } from "@/lib/slide-deck/agent-jobs";

export async function runSlideDeckAgentJob(job: SlideDeckJobRow) {
  const tokens = job.publish_after_apply
    ? await loadGoogleTokensForUser(job.user_id)
    : null;

  return runSlideDeckBuild({
    build: {
      id: job.id,
      org_id: "",
      rig_id: null,
      created_by: job.user_id,
      plan_id: job.plan_id,
      service_type_id: job.service_type_id,
      status: job.status,
      commit_plan: job.commit_plan,
      implementation_plan: null,
      library_selections: job.library_selections,
      change_summary: null,
      publish_after_apply: job.publish_after_apply,
      base_snapshot_id: null,
      result: job.result,
      error_message: job.error_message,
      claimed_at: job.claimed_at,
      completed_at: job.completed_at,
      created_at: job.created_at,
      updated_at: job.updated_at,
    },
    googleTokens: tokens,
  });
}
