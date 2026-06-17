/**
 * Inspect latest org index snapshot (template + library counts).
 *   npm run pp:inspect-index
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import {
  libraryIndexFromSnapshot,
  resolveTemplateFromSnapshot,
} from "../src/lib/pp-platform/cloud-index";
import { resolveTemplatePlaylistName } from "../src/lib/config/slide-deck";
import { getLatestSnapshotForOrg } from "../src/lib/pp-platform/snapshots";

async function main() {
  const orgId = process.env.PP_PLATFORM_ORG_ID?.trim();
  if (!orgId) {
    console.error("Set PP_PLATFORM_ORG_ID in .env.local");
    process.exit(1);
  }

  const snap = await getLatestSnapshotForOrg(orgId);
  if (!snap) {
    console.log("NO SNAPSHOT — run Scan on presentation rig or: npm run pp:index-upload");
    process.exit(1);
  }

  const template = resolveTemplateFromSnapshot(snap.index_json);
  const lib = libraryIndexFromSnapshot(snap.index_json);
  const templateNames = snap.index_json.templatePlaylists?.map((p) => p.name) ?? [];
  const playlistFiles = (snap.index_json.files ?? [])
    .filter((f) => /\.proplaylist$/i.test(f.relativePath))
    .map((f) => f.relativePath);

  console.log("Org:", orgId);
  console.log("Snapshot at:", snap.snapshot_at);
  console.log("Rig id:", snap.rig_id);
  console.log("Files indexed:", snap.file_count);
  console.log("Library items:", lib.length);
  console.log("Template expected:", resolveTemplatePlaylistName());
  console.log("Template resolved:", template);
  console.log("templatePlaylists[]:", templateNames.length ? templateNames : "(empty)");
  console.log(".proplaylist files:", playlistFiles.length);
  const sunday = playlistFiles.filter((p) => /sunday|sun /i.test(p));
  if (sunday.length) {
    console.log("Sunday-related playlists:");
    for (const p of sunday.slice(0, 15)) console.log("  ", p);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
