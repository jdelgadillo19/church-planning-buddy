/**
 * Publish slide-deck package to Google Drive (Playlists + optional New Files).
 *
 *   npm run slide-deck:publish -- <planId> [--service-type-id=<id>] [--published-by=Name]
 *   npm run slide-deck:publish -- <planId> --new-file=path/to/file.pro
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import { loadAnyStoredGoogleTokens } from "../src/app/api/auth/google/_session";
import { getAuthedClients } from "../src/lib/google/auth";
import { parsePositiveIntOrNull } from "../src/lib/pco/client";
import { loadSlideDeckBundle } from "../src/lib/slide-deck/load-bundle";
import { publishSlideDeckPackage } from "../src/lib/slide-deck/publish";

function parseArgs() {
  let planId = "";
  let serviceTypeId: string | undefined;
  let publishedBy: string | undefined;
  const newFilePaths: string[] = [];

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--service-type-id=")) {
      serviceTypeId = arg.split("=")[1]?.trim() || undefined;
    } else if (arg.startsWith("--published-by=")) {
      publishedBy = arg.split("=")[1]?.trim() || undefined;
    } else if (arg.startsWith("--new-file=")) {
      const p = arg.split("=")[1]?.trim();
      if (p) newFilePaths.push(p);
    } else if (!arg.startsWith("-") && !planId) {
      planId = arg.trim();
    }
  }

  return { planId, serviceTypeId, publishedBy, newFilePaths };
}

async function main() {
  const { planId, serviceTypeId, publishedBy, newFilePaths } = parseArgs();
  if (!parsePositiveIntOrNull(planId)) {
    console.error(
      "Usage: npm run slide-deck:publish -- <planId> [--service-type-id=<id>] [--published-by=Name] [--new-file=path]",
    );
    process.exit(1);
  }

  const tokens = await loadAnyStoredGoogleTokens();
  if (!tokens) {
    console.error("No Google session — connect Google in the app first (.data/google-tokens.json).");
    process.exit(1);
  }

  const bundle = await loadSlideDeckBundle({ planId, serviceTypeId });
  const { drive } = getAuthedClients(tokens);

  const newFilePayloads = newFilePaths.map((rel) => {
    const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
    const name = path.basename(abs);
    return {
      name,
      content: readFileSync(abs),
      mimeType: "application/octet-stream",
    };
  });

  const result = await publishSlideDeckPackage({
    drive,
    bundle,
    publishedBy,
    newFilePayloads,
  });

  console.log("Published slide deck package");
  console.log(`  Service folder: ${result.serviceFolderKey}`);
  console.log(`  Package ID:     ${result.packageId}`);
  console.log(`  Drive URL:      ${result.driveFolderUrl}`);
  console.log(`  Playlists files (${result.files.length}):`);
  for (const f of result.files) {
    console.log(`    - ${f.path} (${f.sha256.slice(0, 12)}…)`);
  }
  if (result.newFiles.length > 0) {
    console.log(`  New Files (${result.newFiles.length}):`);
    for (const f of result.newFiles) {
      console.log(`    - ${f.path}`);
    }
  }
  if (bundle.commitPlan.warnings.length > 0) {
    console.log("\nWarnings (see build-report.json on Drive):");
    for (const w of bundle.commitPlan.warnings) {
      console.log(`  - ${w}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
