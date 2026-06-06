import bundledRosterMap from "../../../docs/roster-position-map.json";
import { parseRosterMapJson } from "./roster-position-map-core";

export {
  ROSTER_ALIAS_PLACEHOLDER,
  effectiveTemplateAlias,
  isAliasConfigured,
  isMetaMapKey,
  listUnconfiguredAliasKeys,
  parseRosterMapJson,
  resolveTemplateAlias,
  serializeRosterMap,
  stripTeamPrefix,
} from "./roster-position-map-core";

let rosterPositionMapCache: Record<string, string> | undefined;

export function clearRosterPositionMapCache(): void {
  rosterPositionMapCache = undefined;
}

/** Cached loader used by plan-team and APIs (bundled JSON — no filesystem trace). */
export function loadRosterPositionMap(): Record<string, string> {
  if (rosterPositionMapCache) return rosterPositionMapCache;
  rosterPositionMapCache = parseRosterMapJson(JSON.stringify(bundledRosterMap));
  return rosterPositionMapCache;
}

/** Replace in-memory map after API save (Workers have no writable docs/ path). */
export function setRosterPositionMapCache(map: Record<string, string>): void {
  rosterPositionMapCache = { ...map };
}
