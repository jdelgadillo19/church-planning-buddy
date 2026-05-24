import { pcoGetJsonOrThrow } from "./client";
import { formatPersonShortName, type PersonNameFields } from "./format-person";
import { loadRosterPositionMap, resolveTemplateAlias } from "./roster-position-map";
import {
  isTeamInGrgRosterScope,
  parseRosterTeamIds,
  resolveGrgSection,
  type GrgRosterSection,
} from "./roster-team-scope";

export type PlanRosterRow = {
  teamMemberId: string;
  personId: string;
  displayName: string;
  /** Raw PCO team_position_name */
  pcoPositionName: string;
  /** Resolved GRG template label for matching roster lines */
  positionName: string;
  teamId?: string;
  teamName?: string;
  /** BAND / CHOIR / ALL TEAM / guest (guest needs manual section before apply) */
  grgSection: GrgRosterSection;
  status: string;
};

type PcoTeamMember = {
  id: string;
  type?: string;
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
  attributes?: PersonNameFields;
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

const CONFIRMED_STATUSES = new Set(["c", "confirmed"]);

export function isConfirmedTeamMemberStatus(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  return CONFIRMED_STATUSES.has(status.trim().toLowerCase());
}

export function normalizePositionKey(label: string): string {
  return label.trim().toLowerCase();
}

async function fetchAllTeamMembers(baseUrl: string, auth: string): Promise<PcoCollection> {
  const allData: PcoTeamMember[] = [];
  const includedByKey = new Map<string, PcoPerson | PcoTeam>();

  let url: string | null = `${baseUrl}?include=person,team&per_page=100`;

  while (url) {
    const json = (await pcoGetJsonOrThrow(url, auth)) as PcoCollection;
    const page = Array.isArray(json.data) ? json.data : [];
    allData.push(...page);

    for (const row of json.included ?? []) {
      if (!row?.id || !row.type) continue;
      includedByKey.set(`${row.type}:${row.id}`, row as PcoPerson | PcoTeam);
    }

    url = json.links?.next ?? null;
  }

  return { data: allData, included: [...includedByKey.values()] };
}

/** All team_position_name values on a plan (any status). */
export async function loadPlanTeamPositionNames(
  serviceTypeId: number,
  planId: number,
  auth: string,
): Promise<string[]> {
  const baseUrl = `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`;

  let collection: PcoCollection;
  try {
    collection = await fetchAllTeamMembers(baseUrl, auth);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load team members";
    if (/404|not found/i.test(message)) return [];
    throw e;
  }

  const teamIdFilter = parseRosterTeamIds();
  const teamById = new Map<string, PcoTeam>();
  for (const row of collection.included ?? []) {
    if (row.type === "Team") teamById.set(row.id, row as PcoTeam);
  }

  const names = new Set<string>();
  for (const member of collection.data ?? []) {
    const teamId = member.relationships?.team?.data?.id;
    const team = teamId ? teamById.get(teamId) : undefined;
    const positionRaw =
      member.attributes?.team_position_name?.trim() ||
      member.attributes?.name?.trim() ||
      "";
    if (!isTeamInGrgRosterScope(team, teamIdFilter, positionRaw)) continue;
    if (positionRaw) names.add(positionRaw);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function loadPlanTeamMembers(
  serviceTypeId: number,
  planId: number,
  auth: string,
  positionMap?: Record<string, string>,
): Promise<PlanRosterRow[]> {
  const baseUrl = `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`;

  let collection: PcoCollection;
  try {
    collection = await fetchAllTeamMembers(baseUrl, auth);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load team members";
    if (/404|not found/i.test(message)) return [];
    throw e;
  }

  const map = positionMap ?? loadRosterPositionMap();

  const personById = new Map<string, PcoPerson>();
  const teamById = new Map<string, PcoTeam>();
  for (const row of collection.included ?? []) {
    if (row.type === "Person") personById.set(row.id, row as PcoPerson);
    if (row.type === "Team") teamById.set(row.id, row as PcoTeam);
  }

  const teamIdFilter = parseRosterTeamIds();
  const roster: PlanRosterRow[] = [];

  for (const member of collection.data ?? []) {
    if (!member?.id) continue;

    const teamId = member.relationships?.team?.data?.id;
    const team = teamId ? teamById.get(teamId) : undefined;

    const pcoPositionNameEarly =
      member.attributes?.team_position_name?.trim() ||
      member.attributes?.name?.trim() ||
      "";
    if (!isTeamInGrgRosterScope(team, teamIdFilter, pcoPositionNameEarly)) continue;

    const status = member.attributes?.status ?? "";
    if (!isConfirmedTeamMemberStatus(status)) continue;

    const pcoPositionName =
      member.attributes?.team_position_name?.trim() ||
      member.attributes?.name?.trim() ||
      "";
    if (!pcoPositionName) continue;

    const personId = member.relationships?.person?.data?.id;
    if (!personId) continue;

    const person = personById.get(personId);
    const displayName =
      formatPersonShortName(person?.attributes ?? {}) ||
      member.attributes?.name?.trim() ||
      "";
    if (!displayName) continue;

    const positionName = resolveTemplateAlias(pcoPositionName, map);
    const grgSection = resolveGrgSection(pcoPositionName, team?.attributes?.name ?? undefined);
    if (grgSection === "other") continue;

    roster.push({
      teamMemberId: member.id,
      personId,
      displayName,
      pcoPositionName,
      positionName,
      teamId: teamId ?? undefined,
      teamName: team?.attributes?.name?.trim() || undefined,
      grgSection,
      status,
    });
  }

  return roster;
}

/** First confirmed assignment per template position key (case-insensitive). */
export function rosterByPosition(roster: PlanRosterRow[]): Map<string, PlanRosterRow> {
  const map = new Map<string, PlanRosterRow>();
  for (const row of roster) {
    const key = normalizePositionKey(row.positionName);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

// Re-export for callers that used mapPositionToTemplateLabel
export { resolveTemplateAlias, loadRosterPositionMap, stripTeamPrefix } from "./roster-position-map";
