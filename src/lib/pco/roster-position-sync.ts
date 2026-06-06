import {
  loadRosterPositionMapFromDisk,
  saveRosterPositionMap,
} from "./roster-position-map-io";
import { ROSTER_ALIAS_PLACEHOLDER } from "./roster-position-map-core";

export { defaultRosterMapPath } from "./roster-position-map-io";

export function detectNewPcoPositions(
  pcoNames: string[],
  map: Record<string, string>,
): string[] {
  const existing = new Set(Object.keys(map));
  const added: string[] = [];

  for (const name of pcoNames) {
    const trimmed = name.trim();
    if (!trimmed || existing.has(trimmed)) continue;
    existing.add(trimmed);
    added.push(trimmed);
  }

  return added.sort((a, b) => a.localeCompare(b));
}

export function mergePositionsIntoMap(
  map: Record<string, string>,
  newNames: string[],
): { map: Record<string, string>; added: string[] } {
  const next = { ...map };
  const added: string[] = [];

  for (const name of newNames) {
    const trimmed = name.trim();
    if (!trimmed || trimmed in next) continue;
    next[trimmed] = ROSTER_ALIAS_PLACEHOLDER;
    added.push(trimmed);
  }

  return { map: next, added };
}

export function mergeCatalogIntoMap(
  existing: Record<string, string>,
  catalogNames: string[],
): { map: Record<string, string>; added: string[] } {
  const next = { ...existing };
  const added: string[] = [];

  for (const name of catalogNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (!(trimmed in next)) {
      next[trimmed] = ROSTER_ALIAS_PLACEHOLDER;
      added.push(trimmed);
    }
  }

  return { map: next, added };
}

/** Preserve user-configured aliases when refreshing from PCO catalog. */
export function syncMapWithCatalog(
  existing: Record<string, string>,
  catalogNames: string[],
): { map: Record<string, string>; added: string[] } {
  return mergeCatalogIntoMap(existing, catalogNames);
}

export function persistNewPcoPositions(
  pcoNames: string[],
  mapPath?: string,
): { map: Record<string, string>; added: string[] } {
  const current = loadRosterPositionMapFromDisk(mapPath);
  const newOnes = detectNewPcoPositions(pcoNames, current);
  if (newOnes.length === 0) return { map: current, added: [] };

  const { map, added } = mergePositionsIntoMap(current, newOnes);
  saveRosterPositionMap(map, mapPath);
  return { map, added };
}
