/**
 * MVP: GRG roster = confirmed members on Platform Team (or BAND / CHOIR / ALL TEAM sub-teams)
 * with worship positions (BAND - …, CHOIR - …, ALL TEAM - …, Guests).
 */

export const DEFAULT_GRG_ROSTER_TEAM_NAMES = [
  "Platform Team",
  "BAND",
  "CHOIR",
  "ALL TEAM",
] as const;

export type GrgRosterSection = "band" | "choir" | "all_team" | "guest" | "other";

export function parseRosterTeamIds(): Set<string> | null {
  const raw = process.env.GRG_ROSTER_TEAM_IDS?.trim();
  if (!raw) return null;
  const ids = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
  return ids.length > 0 ? new Set(ids) : null;
}

export function parseRosterTeamNameFilter(): Set<string> {
  const raw = process.env.GRG_ROSTER_TEAM_NAMES?.trim();
  if (raw) {
    return new Set(
      raw
        .split(/[,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return new Set(DEFAULT_GRG_ROSTER_TEAM_NAMES.map((n) => n.toLowerCase()));
}

/** GRG intro section from PCO team_position_name (BAND - Drums → band, Guests → guest). */
export function sectionKeyFromPcoPositionName(pcoPositionName: string): GrgRosterSection {
  const t = pcoPositionName.trim();
  if (/^BAND\s*-/i.test(t) || t.toUpperCase() === "BAND") return "band";
  if (/^CHOIR\s*-/i.test(t) || t.toUpperCase() === "CHOIR") return "choir";
  if (/^ALL\s+TEAM/i.test(t)) return "all_team";
  if (/^guests?$/i.test(t)) return "guest";
  return "other";
}

export function sectionKeyFromTeamName(teamName: string | undefined): GrgRosterSection {
  if (!teamName?.trim()) return "other";
  const t = teamName.trim().toUpperCase();
  if (t === "BAND" || t.startsWith("BAND")) return "band";
  if (t === "CHOIR" || t.startsWith("CHOIR")) return "choir";
  if (t.includes("ALL TEAM")) return "all_team";
  return "other";
}

export function resolveGrgSection(
  pcoPositionName: string,
  teamName?: string,
): GrgRosterSection {
  const fromPos = sectionKeyFromPcoPositionName(pcoPositionName);
  if (fromPos !== "other") return fromPos;
  return sectionKeyFromTeamName(teamName);
}

/** Worship / guest positions that belong on the GRG intro roster. */
export function isGrgRosterPositionName(pcoPositionName: string): boolean {
  const section = sectionKeyFromPcoPositionName(pcoPositionName);
  return section === "band" || section === "choir" || section === "all_team" || section === "guest";
}

/** Position names used on GRG intro (BAND - Drums, CHOIR - WL, etc.). */
export function isPlatformTeamPositionName(positionName: string): boolean {
  const t = positionName.trim();
  if (!t) return false;
  return /^(BAND|CHOIR|ALL\s+TEAM)(\s*-\s*|\s*$)/i.test(t);
}

export function isTeamInGrgRosterScope(
  team: { id: string; attributes?: { name?: string | null } } | undefined,
  teamIdFilter: Set<string> | null = parseRosterTeamIds(),
  pcoPositionName?: string,
): boolean {
  if (!team?.id) return false;
  if (teamIdFilter?.size) return teamIdFilter.has(team.id);

  const name = (team.attributes?.name ?? "").trim().toLowerCase();
  if (!name) return false;

  const allowed = parseRosterTeamNameFilter();

  if (name === "platform team") {
    if (!allowed.has("platform team")) return false;
    if (!pcoPositionName?.trim()) return true;
    return isGrgRosterPositionName(pcoPositionName);
  }

  if (allowed.has(name)) {
    if (name === "band" || name === "choir" || name.startsWith("all team")) return true;
    return !pcoPositionName?.trim() || isGrgRosterPositionName(pcoPositionName);
  }

  return false;
}
