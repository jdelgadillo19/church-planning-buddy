import type { PlanRosterRow } from "@/lib/pco/plan-team";
import {
  sectionKeyFromPcoPositionName,
  type GrgRosterSection,
} from "@/lib/pco/roster-team-scope";
export type RosterSectionKey = "band" | "choir" | "all_team";
export type RosterSectionOverride = Record<string, RosterSectionKey>;

export type RosterAssignment = {
  teamMemberId: string;
  pcoPositionName: string;
  positionName: string;
};

export type RosterConflictGroup = {
  groupId: string;
  section: RosterSectionKey;
  displayName: string;
  assignments: RosterAssignment[];
};

export type ConsolidatedRosterLine = {
  groupId: string;
  section: RosterSectionKey;
  displayName: string;
  positionLabels: string[];
  filledLine: string;
  sourceTeamMemberIds: string[];
  sourcePcoPositionNames: string[];
};

export type RosterSelections = Record<string, string[]>;

function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase();
}

export function rosterConflictGroupId(section: RosterSectionKey, displayName: string): string {
  return `${section}|${normalizeDisplayName(displayName)}`;
}

function effectiveGrgSection(
  row: PlanRosterRow,
  guestOverrides?: RosterSectionOverride,
): RosterSectionKey | null {
  let section: GrgRosterSection = row.grgSection ?? sectionKeyFromPcoPositionName(row.pcoPositionName);
  if (section === "guest" && guestOverrides?.[row.teamMemberId]) {
    section = guestOverrides[row.teamMemberId];
  }
  if (section === "band" || section === "choir" || section === "all_team") return section;
  return null;
}

/** Rows with resolved section (guest overrides applied). */
export function rosterRowsInScope(
  roster: PlanRosterRow[],
  guestOverrides?: RosterSectionOverride,
): Array<PlanRosterRow & { resolvedSection: RosterSectionKey }> {
  const result: Array<PlanRosterRow & { resolvedSection: RosterSectionKey }> = [];
  for (const row of roster) {
    const resolvedSection = effectiveGrgSection(row, guestOverrides);
    if (!resolvedSection) continue;
    result.push({ ...row, resolvedSection });
  }
  return result;
}

export function buildFilledRosterLineMulti(displayName: string, positionLabels: string[]): string {
  const labels = positionLabels.map((l) => l.trim()).filter(Boolean);
  if (labels.length === 0) return displayName.trim();
  return `${displayName.trim()}: ${labels.join(" / ")}`;
}

/** Groups with 2+ assignments for the same person in the same section. */
export function detectRosterConflicts(
  roster: PlanRosterRow[],
  guestOverrides?: RosterSectionOverride,
): RosterConflictGroup[] {
  const inScope = rosterRowsInScope(roster, guestOverrides);
  const byGroup = new Map<string, RosterConflictGroup>();

  for (const row of inScope) {
    const groupId = rosterConflictGroupId(row.resolvedSection, row.displayName);
    let group = byGroup.get(groupId);
    if (!group) {
      group = {
        groupId,
        section: row.resolvedSection,
        displayName: row.displayName,
        assignments: [],
      };
      byGroup.set(groupId, group);
    }
    group.assignments.push({
      teamMemberId: row.teamMemberId,
      pcoPositionName: row.pcoPositionName,
      positionName: row.positionName,
    });
  }

  return [...byGroup.values()].filter((g) => g.assignments.length > 1);
}

function selectedAssignmentsForGroup(
  group: RosterConflictGroup,
  selections: RosterSelections | undefined,
): RosterAssignment[] {
  const selectedIds = selections?.[group.groupId];
  if (selectedIds?.length) {
    const idSet = new Set(selectedIds);
    return group.assignments.filter((a) => idSet.has(a.teamMemberId));
  }
  if (group.assignments.length === 1) return group.assignments;
  return [];
}

export function rosterSelectionsComplete(
  roster: PlanRosterRow[],
  guestOverrides?: RosterSectionOverride,
  selections?: RosterSelections,
): boolean {
  const conflicts = detectRosterConflicts(roster, guestOverrides);
  for (const group of conflicts) {
    const picked = selections?.[group.groupId] ?? [];
    if (picked.length < 1) return false;
  }
  return true;
}

export function consolidateRosterLines(
  roster: PlanRosterRow[],
  guestOverrides?: RosterSectionOverride,
  selections?: RosterSelections,
): ConsolidatedRosterLine[] {
  const inScope = rosterRowsInScope(roster, guestOverrides);
  const byGroup = new Map<string, RosterConflictGroup>();

  for (const row of inScope) {
    const groupId = rosterConflictGroupId(row.resolvedSection, row.displayName);
    let group = byGroup.get(groupId);
    if (!group) {
      group = {
        groupId,
        section: row.resolvedSection,
        displayName: row.displayName,
        assignments: [],
      };
      byGroup.set(groupId, group);
    }
    group.assignments.push({
      teamMemberId: row.teamMemberId,
      pcoPositionName: row.pcoPositionName,
      positionName: row.positionName,
    });
  }

  const lines: ConsolidatedRosterLine[] = [];
  for (const group of byGroup.values()) {
    const picked = selectedAssignmentsForGroup(group, selections);
    if (picked.length === 0) continue;

    const positionLabels = picked.map((a) => a.positionName);
    lines.push({
      groupId: group.groupId,
      section: group.section,
      displayName: group.displayName,
      positionLabels,
      filledLine: buildFilledRosterLineMulti(group.displayName, positionLabels),
      sourceTeamMemberIds: picked.map((a) => a.teamMemberId),
      sourcePcoPositionNames: picked.map((a) => a.pcoPositionName),
    });
  }

  const sectionOrder: Record<RosterSectionKey, number> = {
    band: 0,
    choir: 1,
    all_team: 2,
  };

  return lines.sort((a, b) => {
    const so = sectionOrder[a.section] - sectionOrder[b.section];
    if (so !== 0) return so;
    return a.displayName.localeCompare(b.displayName);
  });
}
