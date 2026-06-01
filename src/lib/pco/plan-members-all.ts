import { pcoGetJsonOrThrow } from "./client";
import { isTeamInGrgRosterScope, parseRosterTeamIds } from "./roster-team-scope";

export type PlanTeamMemberStatusRow = {
  teamMemberId: string;
  personId: string;
  displayName: string;
  status: string;
  teamName?: string;
  pcoPositionName: string;
};

type PcoTeamMember = {
  id: string;
  attributes?: {
    status?: string | null;
    team_position_name?: string | null;
    name?: string | null;
  };
  relationships?: {
    person?: { data?: { id?: string } | null };
    team?: { data?: { id?: string } | null };
  };
};

type PcoPerson = {
  id: string;
  type?: string;
  attributes?: { first_name?: string | null; last_name?: string | null };
};

type PcoTeam = {
  id: string;
  type?: string;
  attributes?: { name?: string | null };
};

type PcoCollection = {
  data?: PcoTeamMember[];
  included?: Array<PcoPerson | PcoTeam>;
  links?: { next?: string | null };
};

async function fetchAllTeamMembers(baseUrl: string, auth: string): Promise<PcoCollection> {
  const allData: PcoTeamMember[] = [];
  const includedByKey = new Map<string, PcoPerson | PcoTeam>();

  let url: string | null = `${baseUrl}?include=person,team&per_page=100`;

  while (url) {
    const json = (await pcoGetJsonOrThrow(url, auth)) as PcoCollection;
    allData.push(...(json.data ?? []));
    for (const row of json.included ?? []) {
      if (!row?.id || !row.type) continue;
      includedByKey.set(`${row.type}:${row.id}`, row);
    }
    url = json.links?.next ?? null;
  }

  return { data: allData, included: [...includedByKey.values()] };
}

/** Worship-scoped team members on a plan (any status). */
export async function loadPlanTeamMembersAllStatuses(
  serviceTypeId: number,
  planId: number,
  auth: string,
): Promise<PlanTeamMemberStatusRow[]> {
  const baseUrl = `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`;

  let collection: PcoCollection;
  try {
    collection = await fetchAllTeamMembers(baseUrl, auth);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load team members";
    if (/404|not found/i.test(message)) return [];
    throw e;
  }

  const personById = new Map<string, PcoPerson>();
  const teamById = new Map<string, PcoTeam>();
  for (const row of collection.included ?? []) {
    if (row.type === "Person") personById.set(row.id, row as PcoPerson);
    if (row.type === "Team") teamById.set(row.id, row as PcoTeam);
  }

  const teamIdFilter = parseRosterTeamIds();
  const out: PlanTeamMemberStatusRow[] = [];

  for (const member of collection.data ?? []) {
    if (!member?.id) continue;
    const teamId = member.relationships?.team?.data?.id;
    const team = teamId ? teamById.get(teamId) : undefined;
    const pcoPositionName =
      member.attributes?.team_position_name?.trim() ||
      member.attributes?.name?.trim() ||
      "";
    if (!isTeamInGrgRosterScope(team, teamIdFilter, pcoPositionName)) continue;

    const personId = member.relationships?.person?.data?.id;
    if (!personId) continue;

    const person = personById.get(personId);
    const first = person?.attributes?.first_name?.trim() ?? "";
    const last = person?.attributes?.last_name?.trim() ?? "";
    const displayName =
      [first, last].filter(Boolean).join(" ") ||
      member.attributes?.name?.trim() ||
      "";

    out.push({
      teamMemberId: member.id,
      personId,
      displayName,
      status: member.attributes?.status ?? "",
      teamName: team?.attributes?.name?.trim() || undefined,
      pcoPositionName,
    });
  }

  return out;
}
