/**
 * Dry-run manifest from CLI (no ProPresenter writes).
 *
 *   npm run slide-deck:manifest -- <planId> [--service-type-id=<id>]
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import { parsePositiveIntOrNull } from "../src/lib/pco/client";
import { loadPlanServiceOrder } from "../src/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "../src/lib/slide-deck/manifest";
import { ppPing } from "../src/lib/propresenter/client";
import { loadProPresenterConfig } from "../src/lib/propresenter/config";
import { findPlaylistByName } from "../src/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName } from "../src/lib/config/slide-deck";

function parseArgs() {
  let planId = "";
  let serviceTypeId: string | undefined;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--service-type-id=")) {
      serviceTypeId = arg.split("=")[1]?.trim() || undefined;
    } else if (!arg.startsWith("-") && !planId) {
      planId = arg.trim();
    }
  }
  return { planId, serviceTypeId };
}

async function main() {
  const { planId, serviceTypeId } = parseArgs();
  if (!parsePositiveIntOrNull(planId)) {
    console.error("Usage: npm run slide-deck:manifest -- <planId> [--service-type-id=<id>]");
    process.exit(1);
  }

  const plan = await loadPlanServiceOrder({ planId, serviceTypeId });

  let connected = false;
  let templateFound: boolean | null = null;
  let templateId: string | undefined;

  try {
    await ppPing(loadProPresenterConfig());
    connected = true;
    const found = await findPlaylistByName(resolveTemplatePlaylistName());
    templateFound = found !== null;
    templateId = found?.id;
  } catch {
    templateFound = null;
  }

  const manifest = buildSlideDeckManifest({
    plan,
    templateSourceFound: connected ? templateFound : null,
    templateSourcePlaylistId: templateId,
    propresenterConnected: connected,
  });

  console.log(`=== LIVE MANIFEST ${planId} ===`);
  console.log(`Playlist: ${manifest.playlistName}`);
  console.log(
    `Template: ${manifest.template.sourcePlaylistName} | found: ${manifest.template.sourceFound}${templateId ? ` (${templateId})` : ""}`,
  );
  console.log(`ProPresenter connected: ${connected}`);
  console.log(`Summary: ${JSON.stringify(manifest.summary)}`);
  console.log("");
  console.log("ALL PCO ITEMS:");
  for (const item of plan.items) {
    console.log(`${String(item.sequence).padStart(3)}  ${item.itemType.padEnd(10)}  ${item.title}`);
  }
  console.log("");
  console.log("MANIFEST:");
  for (const el of manifest.elements) {
    const keyArtist =
      el.key || el.artist ? ` [${[el.key, el.artist].filter(Boolean).join(" · ")}]` : "";
    console.log(
      `${String(el.order).padStart(2)}  ${el.pcoItemType.padEnd(10)}  ${el.matchStatus.padEnd(16)}  ${el.pcoTitle}${keyArtist}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
