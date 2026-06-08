/**
 * Index scan upload for Grapevine Rig (rig auth).
 * Env: GRAPEVINE_PREP_URL, RIG_ID, RIG_SECRET, PP_* (optional)
 */
import { loadEnvLocal } from "../../../scripts/_load-env-local";

loadEnvLocal();

import os from "node:os";
import { scanBundle } from "@/lib/propresenter/bundle-sync/scanner";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { loadSongLibraryIndex } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";

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

async function enrichSnapshot(snapshot: Awaited<ReturnType<typeof scanBundle>>["snapshot"]) {
  try {
    await ppPing(loadProPresenterConfig());
    snapshot.libraryIndex = await loadSongLibraryIndex();
    const templateName = resolveTemplatePlaylistName();
    const found = await findPlaylistByName(templateName);
    if (found) {
      const items = found.id ? await getPlaylistItems(found.id) : [];
      snapshot.templatePlaylists = [
        { name: found.name, id: found.id, itemCount: items.length },
      ];
      snapshot.templateItems = items;
    }
  } catch (e) {
    if (!(e instanceof ProPresenterApiError)) throw e;
  }
}

async function main() {
  const rigId = process.env.RIG_ID?.trim();
  if (!rigId) throw new Error("RIG_ID required.");

  const scan = await scanBundle({
    deviceLabel: process.env.PP_RIG_DISPLAY_NAME?.trim() || os.hostname(),
  });
  await enrichSnapshot(scan.snapshot);

  const res = await fetch(`${apiBase()}/api/pp/rigs/${rigId}/snapshots`, {
    method: "POST",
    headers: {
      Authorization: rigAuthHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ snapshot: scan.snapshot }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    snapshot?: { id: string; snapshotAt: string };
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Scan upload failed (${res.status})`);
  }
  console.log(JSON.stringify({ ok: true, snapshot: data.snapshot }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
