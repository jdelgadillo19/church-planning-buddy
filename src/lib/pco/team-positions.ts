import { pcoGetJsonOrThrow } from "./client";
import { isPlatformTeamPositionName, isTeamInGrgRosterScope } from "./roster-team-scope";

export type PcoTeamPosition = {
  id: string;
  type?: string;
  attributes?: { name?: string | null; sequence?: number | null };
  relationships?: {
    team?: { data?: { id?: string; type?: string } | null };
  };
};

type PcoTeamRef = {
  id: string;
  type?: string;
  attributes?: { name?: string | null };
};

type PcoTeamPositionCollection = {
  data?: PcoTeamPosition[];
  included?: PcoTeamRef[];
  links?: { next?: string | null };
};

export type ServiceTypeTeamPositionsResult = {
  positions: PcoTeamPosition[];
  teamsById: Map<string, PcoTeamRef>;
};

export async function loadServiceTypeTeamPositions(
  serviceTypeId: number,
  auth: string,
): Promise<ServiceTypeTeamPositionsResult> {
  const positions: PcoTeamPosition[] = [];
  const teamsById = new Map<string, PcoTeamRef>();
  let url: string | null =
    `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/team_positions?include=team&per_page=100`;

  while (url) {
    const json = (await pcoGetJsonOrThrow(url, auth)) as PcoTeamPositionCollection;
    const page = Array.isArray(json.data) ? json.data : [];
    positions.push(...page);

    for (const row of json.included ?? []) {
      if (row?.id && row.type === "Team") teamsById.set(row.id, row);
    }

    url = json.links?.next ?? null;
  }

  return { positions, teamsById };
}

/** MVP: only Platform Team worship positions (BAND, CHOIR, ALL TEAM). */
export function collectPositionNamesFromCatalog(
  positions: PcoTeamPosition[],
  teamsById: Map<string, PcoTeamRef>,
): string[] {
  const names = new Set<string>();
  for (const pos of positions) {
    const name = pos.attributes?.name?.trim();
    if (!name) continue;

    const teamId = pos.relationships?.team?.data?.id;
    const team = teamId ? teamsById.get(teamId) : undefined;

    if (team) {
      if (!isTeamInGrgRosterScope(team)) continue;
    } else if (!isPlatformTeamPositionName(name)) {
      continue;
    }

    names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function mergePositionNameLists(...lists: string[][]): string[] {
  const names = new Set<string>();
  for (const list of lists) {
    for (const name of list) {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
