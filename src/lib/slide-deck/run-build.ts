import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { getAuthedClients, type GoogleOAuthConfig } from "@/lib/google/auth";
import { applyCommitPlan } from "@/lib/slide-deck/apply-commit";
import { buildPublishBundleFromCommit } from "@/lib/slide-deck/load-bundle";
import { publishSlideDeckPackage } from "@/lib/slide-deck/publish";
import { resolveApplyContextFromClientPlan } from "@/lib/slide-deck/resolve-apply-context";
import type { SlideDeckBuildRow } from "@/lib/pp-platform/types";
import { loadProPresenterConfig } from "@/lib/propresenter/config";

export type RunSlideDeckBuildInput = {
  build: SlideDeckBuildRow;
  googleTokens?: GoogleTokens | null;
  /** OAuth app credentials from cloud run-context (rig has no .env.local). */
  googleOAuth?: GoogleOAuthConfig | null;
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

    const bundle = buildPublishBundleFromCommit(
      build.commit_plan,
      applyResult,
      build.service_type_id ? Number(build.service_type_id) : undefined,
    );

    const oauth = input.googleOAuth ?? undefined;
    if (!oauth?.clientId || !oauth?.clientSecret) {
      throw new Error(
        "Google OAuth is not configured on Grapevine Prep — contact your admin.",
      );
    }

    const { drive } = getAuthedClients(tokens, oauth);
    publishResult = await publishSlideDeckPackage({
      drive,
      bundle,
    });
  }

  return { apply: applyResult, publish: publishResult };
}
