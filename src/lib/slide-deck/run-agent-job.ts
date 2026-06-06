import { getAuthedClients } from "@/lib/google/auth";
import { loadGoogleTokensForUser } from "@/lib/google/token-store";
import { applyCommitPlan } from "@/lib/slide-deck/apply-commit";
import { loadSlideDeckBundle } from "@/lib/slide-deck/load-bundle";
import { publishSlideDeckPackage } from "@/lib/slide-deck/publish";
import { resolveApplyContextFromClientPlan } from "@/lib/slide-deck/resolve-apply-context";
import type { SlideDeckJobRow } from "@/lib/slide-deck/agent-jobs";
import { loadProPresenterConfig } from "@/lib/propresenter/config";

export async function runSlideDeckAgentJob(job: SlideDeckJobRow) {
  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    throw new Error("PP_ALLOW_WRITES=true is required on the operator Mac.");
  }

  const { commitPlan, templateItems, libraryIndex } = await resolveApplyContextFromClientPlan(
    job.commit_plan,
  );

  const applyResult = await applyCommitPlan({
    commitPlan,
    templateItems,
    libraryIndex,
    playlistResolution: job.resolution === "overwrite" ? "overwrite" : "reuse_empty",
    librarySelections: job.library_selections,
  });

  let publishResult;
  if (job.publish_after_apply) {
    const tokens = await loadGoogleTokensForUser(job.user_id);
    if (!tokens?.refresh_token && !tokens?.access_token) {
      throw new Error(
        "Job user has no Google tokens — connect Google in Grapevine Prep before agent publish.",
      );
    }

    const bundle = await loadSlideDeckBundle({
      planId: job.plan_id,
      serviceTypeId: job.service_type_id ?? undefined,
      applyResult,
    });

    const { drive } = getAuthedClients(tokens);
    publishResult = await publishSlideDeckPackage({
      drive,
      bundle,
    });
  }

  return { apply: applyResult, publish: publishResult };
}
