#!/usr/bin/env npx tsx
/**
 * Sync docs/roster-position-map.json from PCO TeamPosition catalog.
 *
 * Usage:
 *   npx tsx scripts/sync-roster-position-map.ts --service-type-id=123
 *   npx tsx scripts/sync-roster-position-map.ts --plan-id=87788328
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildAuthHeader, parsePositiveIntOrNull, pcoGetJsonOrThrow } from "../src/lib/pco/client";
import {
  defaultRosterMapPath,
  loadRosterPositionMapFromDisk,
  saveRosterPositionMap,
} from "../src/lib/pco/roster-position-map";
import { syncMapWithCatalog } from "../src/lib/pco/roster-position-sync";
import {
  collectPositionNamesFromCatalog,
  loadServiceTypeTeamPositions,
} from "../src/lib/pco/team-positions";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs() {
  let serviceTypeId: number | null = null;
  let planId: number | null = null;
  let mapPath = defaultRosterMapPath();

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--service-type-id=")) {
      serviceTypeId = parsePositiveIntOrNull(arg.split("=")[1]);
    } else if (arg.startsWith("--plan-id=")) {
      planId = parsePositiveIntOrNull(arg.split("=")[1]);
    } else if (arg.startsWith("--map-path=")) {
      mapPath = arg.split("=")[1] ?? mapPath;
    }
  }

  return { serviceTypeId, planId, mapPath };
}

async function resolveServiceTypeId(planId: number, auth: string): Promise<number> {
  const planJson = await pcoGetJsonOrThrow(
    `https://api.planningcenteronline.com/services/v2/plans/${planId}`,
    auth,
  );
  const rawId = (planJson as { data?: { relationships?: { service_type?: { data?: { id?: string } } } } })
    .data?.relationships?.service_type?.data?.id;
  const parsed = parsePositiveIntOrNull(rawId);
  if (!parsed) throw new Error(`Could not resolve service type for plan ${planId}.`);
  return parsed;
}

async function main() {
  loadEnvLocal();

  const auth = buildAuthHeader();
  if (!auth) {
    console.error("Missing PCO_ACCESS_TOKEN or PCO_BASIC_TOKEN in .env.local");
    process.exit(1);
  }

  let { serviceTypeId, planId, mapPath } = parseArgs();

  if (!serviceTypeId && planId) {
    serviceTypeId = await resolveServiceTypeId(planId, auth);
    console.log(`Resolved service type ${serviceTypeId} from plan ${planId}`);
  }

  if (!serviceTypeId) {
    console.error("Provide --service-type-id=<id> or --plan-id=<id>");
    process.exit(1);
  }

  const existing = loadRosterPositionMapFromDisk(mapPath);
  const { positions, teamsById } = await loadServiceTypeTeamPositions(serviceTypeId, auth);
  const catalogNames = collectPositionNamesFromCatalog(positions, teamsById);

  const { map, added } = syncMapWithCatalog(existing, catalogNames);
  saveRosterPositionMap(map, mapPath);

  console.log(`Wrote ${Object.keys(map).length} positions to ${mapPath}`);
  console.log(`Added ${added.length} new key(s) with [ALIAS].`);
  if (added.length > 0) {
    for (const name of added) console.log(`  + ${name}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
