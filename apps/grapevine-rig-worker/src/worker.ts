/**
 * Grapevine Rig apply worker — runs on the presentation Mac (spawned by Tauri or CLI).
 *
 * Env: GRAPEVINE_PREP_URL, RIG_ID, RIG_SECRET, BUILD_ID
 * Optional: PP_HOST, PP_PORT, PP_TRANSPORT, PP_ALLOW_WRITES=true
 * Phases: APPLY_ONLY=true | PUBLISH_ONLY=true + PP_NATIVE_EXPORT_PATH + APPLY_RESULT_JSON
 */
import { loadEnvLocal } from "../../../scripts/_load-env-local";

loadEnvLocal();

import type { ApplyCommitResult } from "@/lib/slide-deck/apply-commit";
import { runSlideDeckBuild, runSlideDeckPublish } from "@/lib/slide-deck/run-build";
import type { SlideDeckBuildRow } from "@/lib/pp-platform/types";
import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { PlaylistConflictError } from "@/lib/propresenter/playlist-write";
import { softenPublishWarning } from "@/lib/slide-deck/publish-warning";

function rigAuthHeader() {
  const rigId = process.env.RIG_ID?.trim();
  const secret = process.env.RIG_SECRET?.trim();
  if (!rigId || !secret) throw new Error("RIG_ID and RIG_SECRET required.");
  return `Rig ${rigId}:${secret}`;
}

function apiBase() {
  return (process.env.GRAPEVINE_PREP_URL?.trim() || "https://grapevineprep.com").replace(
    /\/$/,
    "",
  );
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: rigAuthHeader(),
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error ?? `API ${path} failed (${res.status})`));
  }
  return data;
}

type RunContext = {
  build: SlideDeckBuildRow;
  googleTokens: GoogleTokens | null;
  googleOAuth: { clientId: string; clientSecret: string; redirectUri?: string } | null;
};

type BuildResultPayload = {
  apply: ApplyCommitResult;
  publish?: unknown;
  publishWarning?: string;
};

async function loadRunContext(buildId: string, rigId: string): Promise<RunContext> {
  return (await apiFetch(
    `/api/pp/rigs/${rigId}/builds/${buildId}/run-context`,
  )) as RunContext;
}

function logWorkerResult(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

function buildResultPayload(
  apply: ApplyCommitResult,
  publish?: unknown,
  publishWarning?: string,
): BuildResultPayload {
  return {
    apply,
    ...(publish ? { publish } : {}),
    ...(publishWarning ? { publishWarning } : {}),
  };
}

function applySuccessMessage(playlistName: string, publishNote = ""): string {
  return `Apply completed for playlist "${playlistName}".${publishNote}`;
}

function publishNoteFromResult(result: BuildResultPayload): string {
  const publish = result.publish as { driveFolderUrl?: string } | undefined;
  if (publish?.driveFolderUrl) {
    return ` Published to Drive: ${publish.driveFolderUrl}`;
  }
  if (result.publishWarning) {
    return ` ${result.publishWarning}`;
  }
  return "";
}

async function completeBuild(
  rigId: string,
  buildId: string,
  result: BuildResultPayload,
  phase?: string,
) {
  await apiFetch(`/api/pp/rigs/${rigId}/builds/${buildId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed", result }),
  });

  const playlistName = result.apply.playlistName;
  logWorkerResult({
    ok: true,
    ...(phase ? { phase } : {}),
    message: applySuccessMessage(playlistName, publishNoteFromResult(result)),
    result,
  });
}

async function main() {
  const buildId = process.env.BUILD_ID?.trim();
  const rigId = process.env.RIG_ID?.trim();
  if (!buildId || !rigId) {
    throw new Error("BUILD_ID and RIG_ID required.");
  }

  const completeSkipped = process.env.COMPLETE_APPLY_PUBLISH_SKIPPED === "true";
  if (completeSkipped) {
    const applyJson = process.env.APPLY_RESULT_JSON?.trim();
    if (!applyJson) throw new Error("APPLY_RESULT_JSON required.");
    const applyResult = JSON.parse(applyJson) as ApplyCommitResult;
    const publishWarning = softenPublishWarning(
      process.env.PUBLISH_SKIP_REASON?.trim() ||
        "Drive publish was skipped; playlist is ready in ProPresenter.",
    );
    const result = buildResultPayload(applyResult, undefined, publishWarning);
    await completeBuild(rigId, buildId, result, "apply");
    return;
  }

  const applyOnly = process.env.APPLY_ONLY === "true";
  const publishOnly = process.env.PUBLISH_ONLY === "true";

  if (!publishOnly) {
    await apiFetch(`/api/pp/rigs/${rigId}/builds/${buildId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "applying" }),
    });
  }

  const ctx = await loadRunContext(buildId, rigId);

  try {
    if (publishOnly) {
      const nativeExportPath = process.env.PP_NATIVE_EXPORT_PATH?.trim();
      const applyJson = process.env.APPLY_RESULT_JSON?.trim();
      if (!nativeExportPath) throw new Error("PP_NATIVE_EXPORT_PATH required for publish.");
      if (!applyJson) throw new Error("APPLY_RESULT_JSON required for publish.");

      const applyResult = JSON.parse(applyJson) as ApplyCommitResult;
      try {
        const publishResult = await runSlideDeckPublish({
          build: ctx.build,
          applyResult,
          googleTokens: ctx.googleTokens,
          googleOAuth: ctx.googleOAuth,
          nativeExportPath,
        });
        await completeBuild(
          rigId,
          buildId,
          buildResultPayload(applyResult, publishResult),
          "publish",
        );
      } catch (e) {
        const publishWarning = softenPublishWarning(
          e instanceof Error ? e.message : String(e),
        );
        await completeBuild(
          rigId,
          buildId,
          buildResultPayload(applyResult, undefined, publishWarning),
          "publish",
        );
      }
      return;
    }

    const result = await runSlideDeckBuild({
      build: ctx.build,
      googleTokens: ctx.googleTokens,
      googleOAuth: ctx.googleOAuth,
      skipPublish: applyOnly,
    });

    if (applyOnly) {
      if (!ctx.build.publish_after_apply) {
        await completeBuild(rigId, buildId, buildResultPayload(result.apply));
      } else {
        logWorkerResult({
          ok: true,
          phase: "apply",
          message: applySuccessMessage(result.apply.playlistName),
          playlistName: result.apply.playlistName,
          publishAfterApply: true,
          applyResult: result.apply,
        });
      }
      return;
    }

    await completeBuild(
      rigId,
      buildId,
      buildResultPayload(result.apply, result.publish, result.publishWarning),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed";
    await apiFetch(`/api/pp/rigs/${rigId}/builds/${buildId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "failed", error: message }),
    });

    if (e instanceof PlaylistConflictError) {
      logWorkerResult({
        ok: false,
        conflict: true,
        playlistId: e.playlistId,
        playlistName: e.playlistName,
        itemCount: e.itemCount,
        message: e.message,
      });
      process.exit(0);
    }

    throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
