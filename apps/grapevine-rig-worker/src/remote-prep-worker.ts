/**
 * Grapevine Client remote prep worker — pull filebase zip, extract, open PP, build playlist.
 *
 * Env: REMOTE_PREP_JOB_ID, REMOTE_PREP_CLIENT_TOKEN, GRAPEVINE_PREP_URL
 * Optional: PP_HOST, PP_PORT, PP_TRANSPORT, PP_BUNDLE_ROOT, PP_OPEN_APPLESCRIPT_PATH
 */
import { loadEnvLocal } from "../../../scripts/_load-env-local";

loadEnvLocal();

import { remotePrepAuthorization } from "@/lib/remote-prep/auth";
import { extractFilebaseZipToBundle, summarizeExtract } from "@/lib/remote-prep/extract-to-bundle";
import { extractStoreZip } from "@/lib/zip/extract-store-zip";
import { applyCommitPlan } from "@/lib/slide-deck/apply-commit";
import { resolveApplyContextFromCloudSnapshot } from "@/lib/slide-deck/resolve-apply-context";
import { PlaylistConflictError } from "@/lib/propresenter/playlist-write";
import { ppPing } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

function apiBase() {
  return (process.env.GRAPEVINE_PREP_URL?.trim() || "https://grapevineprep.com").replace(/\/$/, "");
}

function jobAuth() {
  const jobId = process.env.REMOTE_PREP_JOB_ID?.trim();
  const token = process.env.REMOTE_PREP_CLIENT_TOKEN?.trim();
  if (!jobId || !token) throw new Error("REMOTE_PREP_JOB_ID and REMOTE_PREP_CLIENT_TOKEN required.");
  return { jobId, token, header: remotePrepAuthorization(jobId, token) };
}

async function apiFetch(path: string, init?: RequestInit) {
  const { header } = jobAuth();
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: header,
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openProPresenter() {
  const script = process.env.PP_OPEN_APPLESCRIPT_PATH?.trim();
  if (script) {
    try {
      await fs.access(script);
      await execFileAsync("/usr/bin/osascript", [script]);
      return;
    } catch {
      // Fall through to the system app launcher below.
    }
  }

  if (process.platform === "darwin") {
    await execFileAsync("/usr/bin/open", ["-a", "ProPresenter"]);
  }
}

function logResult(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

function connectionStillWarming(message: string) {
  return /ECONNREFUSED|Cannot reach ProPresenter|TCP timeout|TCP closed|fetch failed|Failed to connect|AbortError|ETIMEDOUT/i.test(
    message,
  );
}

async function waitForProPresenterReady(config: ReturnType<typeof loadProPresenterConfig>) {
  const deadline = Date.now() + 60_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      await ppPing(config);
      return;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (!connectionStillWarming(lastError)) {
        throw e;
      }
      await sleep(2_000);
    }
  }

  throw new Error(
    `ProPresenter did not become reachable after 60 seconds. ${lastError || "Open ProPresenter and confirm Settings > Network > Enable Network is ON."}`,
  );
}

async function main() {
  const { jobId } = jobAuth();

  await apiFetch(`/api/remote-prep/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "running" }),
  });

  const ctx = (await apiFetch(`/api/remote-prep/jobs/${jobId}/run-context`)) as {
    job: {
      commitPlan: import("@/lib/slide-deck/mock-commit").MockCommitPlan;
      librarySelections: Record<string, string>;
      pullManifest: import("@/lib/google/filebase-pull").FilebasePullManifest;
    };
    applyContext: {
      libraryIndex: import("@/lib/propresenter/library-read").PpLibraryItemRef[];
      libraryItemCount: number;
    };
    pullDownloadPath: string;
  };

  if (!ctx.applyContext?.libraryIndex) {
    throw new Error(
      "Remote prep server response is missing cloud library index. Deploy the latest grapevineprep.com build and retry.",
    );
  }

  const zipRes = await fetch(`${apiBase()}${ctx.pullDownloadPath}`, {
    headers: { Authorization: jobAuth().header },
  });
  if (!zipRes.ok) {
    const text = await zipRes.text();
    throw new Error(`Filebase zip download failed (${zipRes.status}): ${text.slice(0, 200)}`);
  }

  const zipBytes = Buffer.from(await zipRes.arrayBuffer());
  const entries = extractStoreZip(zipBytes);
  const bundleRoot = process.env.PP_BUNDLE_ROOT?.trim();
  if (!bundleRoot) {
    throw new Error(
      "ProPresenter library folder is required. Set it in Grapevine Client → Advanced settings, then Save.",
    );
  }
  const extracted = await extractFilebaseZipToBundle({
    zipBytes,
    bundleRoot,
  });

  await openProPresenter();

  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    throw new Error("PP_ALLOW_WRITES=true is required for remote prep.");
  }
  await waitForProPresenterReady(config);

  const { commitPlan, templateItems, libraryIndex } = resolveApplyContextFromCloudSnapshot(
    ctx.job.commitPlan,
    ctx.applyContext.libraryIndex,
  );

  const applyResult = await applyCommitPlan({
    commitPlan,
    templateItems,
    libraryIndex,
    playlistResolution: "overwrite",
    librarySelections: ctx.job.librarySelections,
  });

  const result = {
    extract: extracted,
    extractSummary: summarizeExtract(entries),
    apply: applyResult,
    pullManifest: ctx.job.pullManifest,
  };

  await apiFetch(`/api/remote-prep/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed", result }),
  });

  logResult({
    ok: true,
    message: `Remote prep completed — playlist "${applyResult.playlistName}" (${applyResult.itemCount} items). ProPresenter should be open with the service playlist ready.`,
    result,
  });
}

main().catch(async (e) => {
  const message = e instanceof Error ? e.message : String(e);
  try {
    const { jobId } = jobAuth();
    if (e instanceof PlaylistConflictError) {
      await apiFetch(`/api/remote-prep/jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "failed",
          error: e.message,
        }),
      });
      logResult({
        ok: false,
        conflict: true,
        playlistId: e.playlistId,
        playlistName: e.playlistName,
        itemCount: e.itemCount,
        message: e.message,
      });
      process.exit(0);
    }
    await apiFetch(`/api/remote-prep/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "failed", error: message }),
    });
  } catch {
    /* best effort */
  }
  console.error(message);
  process.exit(1);
});
