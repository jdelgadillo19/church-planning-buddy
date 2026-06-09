/**
 * Grapevine Rig apply worker — runs on the presentation Mac (spawned by Tauri or CLI).
 *
 * Env: GRAPEVINE_PREP_URL, RIG_ID, RIG_SECRET, BUILD_ID
 * Optional: PP_HOST, PP_PORT, PP_TRANSPORT, PP_ALLOW_WRITES=true
 */
import { loadEnvLocal } from "../../../scripts/_load-env-local";

loadEnvLocal();

import { runSlideDeckBuild } from "@/lib/slide-deck/run-build";
import type { SlideDeckBuildRow } from "@/lib/pp-platform/types";
import type { GoogleTokens } from "@/app/api/auth/google/_session";

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

async function main() {
  const buildId = process.env.BUILD_ID?.trim();
  const rigId = process.env.RIG_ID?.trim();
  if (!buildId || !rigId) {
    throw new Error("BUILD_ID and RIG_ID required.");
  }

  await apiFetch(`/api/pp/rigs/${rigId}/builds/${buildId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "applying" }),
  });

  const ctx = (await apiFetch(
    `/api/pp/rigs/${rigId}/builds/${buildId}/run-context`,
  )) as {
    build: SlideDeckBuildRow;
    googleTokens: GoogleTokens | null;
  };

  try {
    const result = await runSlideDeckBuild({
      build: ctx.build,
      googleTokens: ctx.googleTokens,
    });

    await apiFetch(`/api/pp/rigs/${rigId}/builds/${buildId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed", result }),
    });

    console.log(
      JSON.stringify({
        ok: true,
        message: `Apply completed for playlist "${result.apply.playlistName}".`,
        result,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed";
    await apiFetch(`/api/pp/rigs/${rigId}/builds/${buildId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "failed", error: message }),
    });
    throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
