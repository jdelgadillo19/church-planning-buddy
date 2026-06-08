/**
 * Scan ProPresenter bundle (+ optional live API enrich) and upload org index to Grapevine Prep.
 *
 *   GRAPEVINE_PREP_URL=https://grapevineprep.com \
 *   SLIDE_DECK_AGENT_TOKEN=... \
 *   PP_PLATFORM_ORG_ID=<uuid> \
 *     npm run pp:index-upload
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import os from "node:os";
import { scanBundle } from "../src/lib/propresenter/bundle-sync/scanner";
import { ppPing, ProPresenterApiError } from "../src/lib/propresenter/client";
import { loadProPresenterConfig } from "../src/lib/propresenter/config";
import { loadSongLibraryIndex } from "../src/lib/propresenter/library-read";
import { getPlaylistItems } from "../src/lib/propresenter/playlist-read";
import { findPlaylistByName } from "../src/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName } from "../src/lib/config/slide-deck";

function agentConfig() {
  const token = process.env.SLIDE_DECK_AGENT_TOKEN?.trim();
  const baseUrl = (process.env.GRAPEVINE_PREP_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const orgId = process.env.PP_PLATFORM_ORG_ID?.trim();
  if (!token) throw new Error("Set SLIDE_DECK_AGENT_TOKEN in .env.local");
  if (!orgId) throw new Error("Set PP_PLATFORM_ORG_ID in .env.local (Supabase organizations.id)");
  return { token, baseUrl, orgId };
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
        {
          name: found.name,
          id: found.id,
          itemCount: items.length,
        },
      ];
      snapshot.templateItems = items;
    }
    console.log(
      `[upload] PP API enrich: ${snapshot.libraryIndex?.length ?? 0} library items, template items ${snapshot.templateItems?.length ?? 0}`,
    );
  } catch (e) {
    if (e instanceof ProPresenterApiError) {
      console.warn("[upload] ProPresenter offline — uploading file scan only.");
    } else {
      console.warn("[upload] PP enrich skipped:", e instanceof Error ? e.message : e);
    }
  }
}

async function main() {
  const { token, baseUrl, orgId } = agentConfig();
  const displayName = process.env.PP_RIG_DISPLAY_NAME?.trim() || os.hostname();

  console.log(`[upload] Scanning bundle…`);
  const scan = await scanBundle({ deviceLabel: displayName });
  await enrichSnapshot(scan.snapshot);

  console.log(`[upload] POST ${baseUrl}/api/pp/rigs/bootstrap (${scan.snapshot.files.length} files)`);
  const res = await fetch(`${baseUrl}/api/pp/rigs/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      orgId,
      displayName,
      deviceFingerprint: displayName,
      snapshot: scan.snapshot,
    }),
  });

  const raw = await res.text();
  let data: {
    ok?: boolean;
    error?: string;
    rig?: { id: string; displayName: string };
    snapshot?: { id: string; snapshotAt: string; fileCount: number };
  } = {};
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    const hint = raw.trimStart().startsWith("<!") ? " (got HTML — sign-in redirect? deploy middleware fix)" : "";
    throw new Error(`Upload failed (${res.status})${hint}: ${raw.slice(0, 200)}`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }

  console.log(`[upload] Rig: ${data.rig?.displayName} (${data.rig?.id})`);
  console.log(`[upload] Snapshot: ${data.snapshot?.id} @ ${data.snapshot?.snapshotAt}`);
  console.log(`[upload] Done — refresh slide-deck preview on grapevineprep.com`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
