import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { getAuthedClients } from "@/lib/google/auth";
import { applyCommitPlan } from "@/lib/slide-deck/apply-commit";
import { loadSlideDeckBundle } from "@/lib/slide-deck/load-bundle";
import { publishSlideDeckPackage } from "@/lib/slide-deck/publish";
import { resolveApplyContextFromClientPlan } from "@/lib/slide-deck/resolve-apply-context";
import type { SlideDeckBuildRow } from "@/lib/pp-platform/types";
import { loadProPresenterConfig } from "@/lib/propresenter/config";

export type RunSlideDeckBuildInput = {
  build: SlideDeckBuildRow;
  googleTokens?: GoogleTokens | null;
};

export async function runSlideDeckBuild(input: RunSlideDeckBuildInput) {
  const { build } = input;
  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    throw new Error("PP_ALLOW_WRITES=true is required on the presentation rig.");
  }

  const { commitPlan, templateItems, libraryIndex } = await resolveApplyContextFromClientPlan(
    build.commit_plan,
  );

  const applyResult = await applyCommitPlan({
    commitPlan,
    templateItems,
    libraryIndex,
    playlistResolution: "reuse_empty",
    librarySelections: build.library_selections,
  });

  let publishResult;
  if (build.publish_after_apply) {
    const tokens = input.googleTokens;
    if (!tokens?.refresh_token && !tokens?.access_token) {
      throw new Error(
        "Build author has no Google tokens — connect Google in Grapevine Prep before publish.",
      );
    }

    const bundle = await loadSlideDeckBundle({
      planId: build.plan_id,
      serviceTypeId: build.service_type_id ?? undefined,
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
