import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { getAuthedClients, type GoogleOAuthConfig } from "@/lib/google/auth";
import { applyCommitPlan, type ApplyCommitResult } from "@/lib/slide-deck/apply-commit";
import { implementationPlanToCommitPlan } from "@/lib/slide-deck/implementation-plan";
import { buildPublishBundleFromCommit } from "@/lib/slide-deck/load-bundle";
import { publishSlideDeckPackage } from "@/lib/slide-deck/publish";
import { resolveApplyContextFromClientPlan } from "@/lib/slide-deck/resolve-apply-context";
import type { SlideDeckBuildRow } from "@/lib/pp-platform/types";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { softenPublishWarning } from "@/lib/slide-deck/publish-warning";

export type RunSlideDeckBuildInput = {
  build: SlideDeckBuildRow;
  googleTokens?: GoogleTokens | null;
  /** OAuth app credentials from cloud run-context (rig has no .env.local). */
  googleOAuth?: GoogleOAuthConfig | null;
  /** Rig: ProPresenter export done by Tauri (osascript) before publish. */
  nativeExportPath?: string;
  skipPublish?: boolean;
};

export type RunSlideDeckPublishInput = {
  build: SlideDeckBuildRow;
  applyResult: ApplyCommitResult;
  googleTokens?: GoogleTokens | null;
  googleOAuth?: GoogleOAuthConfig | null;
  /** When set, skips AppleScript export (rig: export done by Grapevine Rig app). */
  nativeExportPath?: string;
};

function requirePublishAuth(
  build: SlideDeckBuildRow,
  tokens: GoogleTokens | null | undefined,
  oauth: GoogleOAuthConfig | null | undefined,
) {
  if (!build.publish_after_apply) return;
  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new Error(
      "Build author has no Google tokens — connect Google in Grapevine Prep before publish.",
    );
  }
  if (!oauth?.clientId || !oauth?.clientSecret) {
    throw new Error("Google OAuth is not configured on Grapevine Prep — contact your admin.");
  }
}

export async function runSlideDeckPublish(input: RunSlideDeckPublishInput) {
  const { build, applyResult } = input;
  requirePublishAuth(build, input.googleTokens, input.googleOAuth);

  const commitPlan = build.implementation_plan
    ? implementationPlanToCommitPlan(build.implementation_plan)
    : build.commit_plan;

  const bundle = buildPublishBundleFromCommit(
    commitPlan,
    applyResult,
    build.service_type_id ? Number(build.service_type_id) : undefined,
  );

  const { drive } = getAuthedClients(input.googleTokens!, input.googleOAuth!);
  const nativeExportPath = input.nativeExportPath?.trim();
  return publishSlideDeckPackage({
    drive,
    bundle,
    ...(nativeExportPath ? { nativeExportPath } : {}),
  });
}

export async function runSlideDeckBuild(input: RunSlideDeckBuildInput) {
  const { build } = input;
  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    throw new Error("PP_ALLOW_WRITES=true is required on the presentation rig.");
  }

  const impl = build.implementation_plan;
  const commitPlan = impl ? implementationPlanToCommitPlan(impl) : build.commit_plan;
  const librarySelections = impl?.librarySelections ?? build.library_selections ?? {};
  // Queued rig/agent builds always replace an existing Sunday playlist (replan).
  const playlistResolution = "overwrite" as const;

  const { commitPlan: resolvedPlan, templateItems, libraryIndex } =
    await resolveApplyContextFromClientPlan(commitPlan);

  const applyResult = await applyCommitPlan({
    commitPlan: resolvedPlan,
    templateItems,
    libraryIndex,
    playlistResolution,
    librarySelections,
  });

  let publishResult;
  let publishWarning: string | undefined;
  if (build.publish_after_apply && !input.skipPublish) {
    try {
      requirePublishAuth(build, input.googleTokens, input.googleOAuth);
      publishResult = await runSlideDeckPublish({
        build,
        applyResult,
        googleTokens: input.googleTokens,
        googleOAuth: input.googleOAuth,
        nativeExportPath: input.nativeExportPath,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      publishWarning = softenPublishWarning(raw);
    }
  }

  return { apply: applyResult, publish: publishResult, publishWarning };
}
