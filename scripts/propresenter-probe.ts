/**
 * Operator Mac: run with ProPresenter 21.3 open and API enabled.
 *
 *   npm run pp:probe
 *   npm run pp:probe -- --uuid <presentation-uuid>
 *   PP_ALLOW_WRITES=true npm run pp:probe -- --status
 */
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

import { loadProPresenterConfig, proPresenterBaseUrl } from "../src/lib/propresenter/config";
import { ppPing } from "../src/lib/propresenter/client";
import { runProPresenterDiagnose } from "../src/lib/propresenter/diagnose";
import { runProPresenterProbe } from "../src/lib/propresenter/probe";

const args = process.argv.slice(2);
const statusOnly = args.includes("--status");
const diagnoseOnly = args.includes("--diagnose");
const jsonOut = args.includes("--json");
const uuidIdx = args.indexOf("--uuid");
const presentationUuid = uuidIdx >= 0 ? args[uuidIdx + 1] : undefined;

async function main() {
  const config = loadProPresenterConfig();
  const baseUrl = proPresenterBaseUrl(config);

  if (diagnoseOnly) {
    console.log(`ProPresenter diagnose (transport=${config.transport})`);
    const report = await runProPresenterDiagnose(config);
    for (const line of report.lines) {
      const mark = line.ok ? "✓" : "✗";
      console.log(`${mark} ${line.test}`);
      console.log(`    ${line.detail}`);
    }
    if (report.hints.length) {
      console.log("\nHints:");
      for (const h of report.hints) console.log(`  • ${h}`);
    }
    const anyOk = report.lines.some((l) => l.ok);
    process.exit(anyOk ? 0 : 1);
  }

  if (statusOnly) {
    console.log(
      `Trying ${baseUrl} (PP_PORT=${config.port}, transport=${config.transport}) …`,
    );
    try {
      await ppPing(config);
      console.log(`OK  ${baseUrl}`);
      process.exit(0);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  const report = await runProPresenterProbe({ presentationUuid, config });

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.connected ? 0 : 1);
  }

  console.log(`ProPresenter probe @ ${report.baseUrl}`);
  console.log(`Connected: ${report.connected}  allowWrites: ${report.allowWrites}`);
  if (report.error) console.log(`Error: ${report.error}`);
  if (report.presentationShape?.length) {
    console.log(`Presentation shape keys: ${report.presentationShape.join(", ")}`);
  }
  console.log("");
  for (const step of report.steps) {
    const mark = step.ok ? "✓" : "✗";
    console.log(`${mark} ${step.name}  ${step.method} ${step.path}`);
    if (step.summary) console.log(`    ${step.summary}`);
    if (step.notes) console.log(`    ${step.notes}`);
  }

  process.exit(report.connected ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
