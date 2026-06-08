/**
 * Read-only ProPresenter bundle scanner (Phase 0 stub).
 *
 *   npm run pp:bundle-scan
 *   npm run pp:bundle-scan -- --json
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import { scanBundle } from "../src/lib/propresenter/bundle-sync/scanner";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");

async function main() {
  const result = await scanBundle({
    deviceLabel: process.env.PP_DEVICE_LABEL?.trim() || "cli",
  });

  if (jsonOut) {
    console.log(JSON.stringify(result.snapshot, null, 2));
    process.exit(0);
  }

  const { snapshot, warnings, skippedPaths } = result;
  console.log(`Bundle scan @ ${snapshot.bundleRoot}`);
  console.log(`Files: ${snapshot.files.length}  skipped: ${skippedPaths}`);
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings.slice(0, 10)) console.log(`  • ${w}`);
    if (warnings.length > 10) console.log(`  … and ${warnings.length - 10} more`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
