import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  parseRosterMapJson,
  serializeRosterMap,
} from "./roster-position-map-core";
import {
  loadRosterPositionMap,
  setRosterPositionMapCache,
} from "./roster-position-map";

export function defaultRosterMapPath(): string {
  return (
    process.env.GRG_ROSTER_POSITION_MAP?.trim() ||
    path.join(process.cwd(), "docs", "roster-position-map.json")
  );
}

/** Load from explicit path (local scripts / dev API). Falls back to bundled map. */
export function loadRosterPositionMapFromDisk(mapPath?: string): Record<string, string> {
  const resolved = mapPath ?? defaultRosterMapPath();
  try {
    const raw = readFileSync(resolved, "utf8");
    const map = parseRosterMapJson(raw);
    setRosterPositionMapCache(map);
    return map;
  } catch {
    return loadRosterPositionMap();
  }
}

export function saveRosterPositionMap(
  map: Record<string, string>,
  mapPath?: string,
): void {
  setRosterPositionMapCache(map);
  const resolved = mapPath ?? defaultRosterMapPath();
  try {
    writeFileSync(resolved, serializeRosterMap(map), "utf8");
  } catch {
    // Workers / read-only deploys: in-memory cache only
  }
}
