export const ROSTER_ALIAS_PLACEHOLDER = "[ALIAS]";

const META_KEY_PREFIX = "_";

export function isMetaMapKey(key: string): boolean {
  return key.startsWith(META_KEY_PREFIX);
}

export function isAliasConfigured(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  if (value.trim() === ROSTER_ALIAS_PLACEHOLDER) return false;
  return true;
}

/** Remove leading team tags like "BAND - " or "CHOIR - ". */
export function stripTeamPrefix(pcoPositionName: string): string {
  const trimmed = pcoPositionName.trim();
  const stripped = trimmed.replace(/^(BAND|CHOIR|ALL\s+TEAM)\s*-\s*/i, "").trim();
  return stripped || trimmed;
}

export function resolveTemplateAlias(
  pcoPositionName: string,
  map: Record<string, string>,
): string {
  const key = pcoPositionName.trim();
  const configured = map[key];
  if (isAliasConfigured(configured)) {
    const alias = configured!.trim();
    if (alias !== ROSTER_ALIAS_PLACEHOLDER) return alias;
  }

  const lower = key.toLowerCase();
  for (const [from, to] of Object.entries(map)) {
    if (isMetaMapKey(from)) continue;
    if (from.trim().toLowerCase() === lower && isAliasConfigured(to)) {
      const alias = to.trim();
      if (alias !== ROSTER_ALIAS_PLACEHOLDER) return alias;
    }
  }

  const stripped = stripTeamPrefix(key);
  const resolved = stripped || key;
  if (resolved === ROSTER_ALIAS_PLACEHOLDER) return stripTeamPrefix(key) || key;
  return resolved;
}

/** Label for UI/API — never returns the [ALIAS] placeholder. */
export function effectiveTemplateAlias(
  pcoPositionName: string,
  map: Record<string, string>,
): string {
  return resolveTemplateAlias(pcoPositionName, map);
}

export function parseRosterMapJson(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as Record<string, string>;
  if (!parsed || typeof parsed !== "object") return {};

  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (isMetaMapKey(key)) continue;
    if (typeof value !== "string") continue;
    map[key] = value;
  }
  return map;
}

export function serializeRosterMap(map: Record<string, string>): string {
  const sorted = Object.keys(map)
    .filter((k) => !isMetaMapKey(k))
    .sort((a, b) => a.localeCompare(b));

  const ordered: Record<string, string> = {
    _comment:
      "Keys are exact PCO team_position_name values. Values are GRG template labels (text after colon in roster lines). Use [ALIAS] until you set a custom alias; unset aliases fall back to the PCO name with BAND-/CHOIR- prefix removed.",
  };

  for (const key of sorted) {
    ordered[key] = map[key] ?? ROSTER_ALIAS_PLACEHOLDER;
  }

  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function listUnconfiguredAliasKeys(map: Record<string, string>): string[] {
  return Object.entries(map)
    .filter(([key, value]) => !isMetaMapKey(key) && !isAliasConfigured(value))
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));
}
