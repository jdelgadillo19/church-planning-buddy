/**
 * Live apply to ProPresenter (requires PP_ALLOW_WRITES=true).
 *
 *   npm run slide-deck:apply -- 87788328
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import { loadPlanServiceOrder } from "../src/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "../src/lib/slide-deck/manifest";
import { buildMockCommitPlan } from "../src/lib/slide-deck/mock-commit";
import { applyCommitPlan } from "../src/lib/slide-deck/apply-commit";
import { ppPing } from "../src/lib/propresenter/client";
import { loadProPresenterConfig } from "../src/lib/propresenter/config";
import { findPlaylistByName } from "../src/lib/propresenter/playlists-read";
import { getPlaylistItems } from "../src/lib/propresenter/playlist-read";
import { loadSongLibraryIndex } from "../src/lib/propresenter/library-read";
import { resolveTemplatePlaylistName } from "../src/lib/config/slide-deck";

async function main() {
  const planId = process.argv[2] || "87788328";
  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    console.error("PP_ALLOW_WRITES is not true. Aborting.");
    process.exit(1);
  }

  await ppPing(config);
  const plan = await loadPlanServiceOrder({ planId });
  const found = await findPlaylistByName(resolveTemplatePlaylistName());
  if (!found?.id) throw new Error("Template playlist not found.");

  const templateItems = await getPlaylistItems(found.id);
  const libraryIndex = await loadSongLibraryIndex();
  const manifest = buildSlideDeckManifest({
    plan,
    templateSourceFound: true,
    templateSourcePlaylistId: found.id,
    propresenterConnected: true,
    templateItems,
  });
  const commitPlan = buildMockCommitPlan({
    manifest,
    templateItems,
    libraryIndex,
    propresenterConnected: true,
  });

  console.log(`Applying "${commitPlan.playlistName}" (${commitPlan.playlistPreview.length} preview rows)...`);
  const result = await applyCommitPlan({ commitPlan, templateItems, libraryIndex });
  console.log("OK", result.playlistName, result.playlistId, result.itemCount, "items");
  for (const item of result.items) {
    console.log(`  ${item.position}. ${item.name}`);
  }
  if (result.warnings.length) {
    console.log("Warnings:");
    for (const w of result.warnings) console.log(" ", w);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
