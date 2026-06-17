/**
 * Grapevine Rig handoff import worker — downloads Services/ package and stages for PP import.
 *
 * Env: GRAPEVINE_PREP_URL, RIG_ID, RIG_SECRET, HANDOFF_ID
 */
import { loadEnvLocal } from "../../../scripts/_load-env-local";

loadEnvLocal();

import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { getAuthedClients, type GoogleOAuthConfig } from "@/lib/google/auth";
import { driveDownloadFileBytes } from "@/lib/google/drive-download";
import { driveListFilesFetch, resolveGoogleAccessToken } from "@/lib/google/drive-fetch";
import type { SlideDeckSubmissionRow } from "@/lib/pp-platform/types";
import fs from "node:fs/promises";
import path from "node:path";

function rigAuthHeader() {
  const rigId = process.env.RIG_ID?.trim();
  const secret = process.env.RIG_SECRET?.trim();
  if (!rigId || !secret) throw new Error("RIG_ID and RIG_SECRET required.");
  return `Rig ${rigId}:${secret}`;
}

function apiBase() {
  return (process.env.GRAPEVINE_PREP_URL?.trim() || "https://grapevineprep.com").replace(/\/$/, "");
}

async function apiFetch<T = Record<string, unknown>>(fetchPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${fetchPath}`, {
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
    throw new Error(`API ${fetchPath} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error ?? `API ${fetchPath} failed (${res.status})`));
  }
  return data as T;
}

type RunContext = {
  handoff: SlideDeckSubmissionRow;
  googleTokens: GoogleTokens;
  googleOAuth: GoogleOAuthConfig;
};

async function listFolderFiles(
  accessToken: string,
  folderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const q = `'${folderId}' in parents and trashed=false`;
  const listed = await driveListFilesFetch(accessToken, { q, pageSize: 100 });
  return listed.files
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id!, name: f.name! }));
}

async function main() {
  const rigId = process.env.RIG_ID?.trim();
  const handoffId = process.env.HANDOFF_ID?.trim();
  if (!rigId || !handoffId) throw new Error("RIG_ID and HANDOFF_ID required.");

  const ctx = (await apiFetch(
    `/api/pp/rigs/${rigId}/handoffs/${handoffId}/run-context`,
  )) as RunContext;

  const handoff = ctx.handoff;
  const folderUrl = handoff.services_drive_url;
  if (!folderUrl) {
    throw new Error("Handoff has no services_drive_url — publish to Services/ first.");
  }

  const folderId = folderUrl.split("/").pop()?.split("?")[0];
  if (!folderId) throw new Error("Could not parse Drive folder id from services_drive_url.");

  const { drive } = getAuthedClients(ctx.googleTokens, ctx.googleOAuth);
  const accessToken = await resolveGoogleAccessToken(ctx.googleTokens);
  if (!accessToken) throw new Error("Google access token unavailable.");

  const files = await listFolderFiles(accessToken, folderId);
  const proplaylist = files.find((f) => f.name.toLowerCase().endsWith(".proplaylist"));
  if (!proplaylist) {
    throw new Error("No .proplaylist found in Services package folder.");
  }

  const stagingDir =
    process.env.HANDOFF_STAGING_DIR?.trim() ||
    path.join(process.cwd(), ".data", "handoff-staging", handoffId.slice(0, 8));
  await fs.mkdir(stagingDir, { recursive: true });

  const bytes = await driveDownloadFileBytes(drive, proplaylist.id);
  const dest = path.join(stagingDir, proplaylist.name);
  await fs.writeFile(dest, bytes);

  await apiFetch(`/api/pp/rigs/${rigId}/handoffs/pending`, {
    method: "PATCH",
    body: JSON.stringify({
      handoffId,
      status: "synced",
      servicesDriveUrl: folderUrl,
    }),
  });

  console.log(
    JSON.stringify({
      ok: true,
      playlistName: handoff.commit_plan.playlistName,
      stagedPath: dest,
      message:
        `Staged ${proplaylist.name}. In ProPresenter: File → Import → Playlist, then select the staged file.`,
    }),
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(1);
});
