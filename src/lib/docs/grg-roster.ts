import type { docs_v1 } from "@/lib/google/api-types";
import type { PlanRosterRow } from "@/lib/pco/plan-team";
import {
  sectionKeyFromPcoPositionName,
  type GrgRosterSection,
} from "@/lib/pco/roster-team-scope";
import {
  consolidateRosterLines,
  type ConsolidatedRosterLine,
  type RosterSelections,
} from "./grg-roster-consolidate";

export type { RosterSectionOverride, RosterSectionKey } from "./grg-roster-consolidate";

/** Template roster line — position comes from PCO, not the reference doc. */
export const ROSTER_NAME_POSITION_PLACEHOLDER =
  "[Name | First-name Last Initial]: [Position]";

/** Matches `[Name | …]: {anything}` roster slot lines. */
export const ROSTER_LINE_RE = /^\[Name\s*\|\s*[^\]]*\]:\s*(.+?)\s*$/i;

export type RosterPreviewEntry = {
  teamName: string;
  section: import("./grg-roster-consolidate").RosterSectionKey;
  pcoPositionName: string;
  positionName: string;
  displayName: string;
  filledLine: string;
  mergedFrom?: string[];
};

export type RosterApplyResult = {
  preview: RosterPreviewEntry[];
  sectionsFilled: import("./grg-roster-consolidate").RosterSectionKey[];
  updated: number;
};

type IndexedParagraph = {
  startIndex: number;
  endIndex: number;
  text: string;
};

function isRosterNameLine(text: string): boolean {
  return ROSTER_LINE_RE.test(text.trim());
}

export function parseRosterPositionFromLine(line: string): string | null {
  const m = line.trim().match(ROSTER_LINE_RE);
  return m?.[1]?.trim() ?? null;
}

export function buildFilledRosterLine(positionLabel: string, displayName: string): string {
  return `${displayName}: ${positionLabel.trim()}`;
}

export function sectionKeyFromHeader(
  text: string,
): import("./grg-roster-consolidate").RosterSectionKey | null {
  const t = text.trim().toUpperCase();
  if (/^BAND\s*[\(:]/.test(t) || t === "BAND") return "band";
  if (/^CHOIR\s*[\(:]/.test(t) || t === "CHOIR") return "choir";
  if (/^ALL\s+TEAM/.test(t)) return "all_team";
  return null;
}

function effectiveGrgSection(
  row: PlanRosterRow,
  guestOverrides?: import("./grg-roster-consolidate").RosterSectionOverride,
): import("./grg-roster-consolidate").RosterSectionKey | null {
  let section: GrgRosterSection = row.grgSection ?? sectionKeyFromPcoPositionName(row.pcoPositionName);
  if (section === "guest" && guestOverrides?.[row.teamMemberId]) {
    section = guestOverrides[row.teamMemberId];
  }
  if (section === "band" || section === "choir" || section === "all_team") return section;
  return null;
}

export function buildRosterPreviewFromPco(
  roster: PlanRosterRow[],
  guestOverrides?: import("./grg-roster-consolidate").RosterSectionOverride,
  rosterSelections?: RosterSelections,
): RosterPreviewEntry[] {
  const lines = consolidateRosterLines(roster, guestOverrides, rosterSelections);
  return lines.map((line) => consolidatedToPreviewEntry(line, roster));
}

function consolidatedToPreviewEntry(
  line: ConsolidatedRosterLine,
  roster: PlanRosterRow[],
): RosterPreviewEntry {
  const firstId = line.sourceTeamMemberIds[0];
  const row = roster.find((r) => r.teamMemberId === firstId);
  const mergedFrom =
    line.sourcePcoPositionNames.length > 1 ? line.sourcePcoPositionNames : undefined;

  return {
    teamName: row?.teamName?.trim() || line.section.toUpperCase(),
    section: line.section,
    pcoPositionName: line.sourcePcoPositionNames.join(", "),
    positionName: line.positionLabels.join(" / "),
    displayName: line.displayName,
    filledLine: line.filledLine,
    mergedFrom,
  };
}

function groupConsolidatedBySection(
  lines: ConsolidatedRosterLine[],
): Map<import("./grg-roster-consolidate").RosterSectionKey, ConsolidatedRosterLine[]> {
  const map = new Map<import("./grg-roster-consolidate").RosterSectionKey, ConsolidatedRosterLine[]>();
  for (const line of lines) {
    const list = map.get(line.section) ?? [];
    list.push(line);
    map.set(line.section, list);
  }
  return map;
}

function collectIndexedParagraphs(doc: docs_v1.Schema$Document): IndexedParagraph[] {
  const paragraphs: IndexedParagraph[] = [];
  for (const el of doc.body?.content ?? []) {
    const p = el.paragraph;
    if (!p || el.startIndex == null || el.endIndex == null) continue;
    let text = "";
    for (const pe of p.elements ?? []) {
      text += pe.textRun?.content ?? "";
    }
    const trimmed = text.replace(/\n$/, "");
    if (trimmed) {
      paragraphs.push({ startIndex: el.startIndex, endIndex: el.endIndex, text: trimmed });
    }
  }
  return paragraphs;
}

function assignParagraphSections(
  paragraphs: IndexedParagraph[],
): Array<
  IndexedParagraph & {
    section: import("./grg-roster-consolidate").RosterSectionKey | null;
    isRosterLine: boolean;
  }
> {
  let current: import("./grg-roster-consolidate").RosterSectionKey | null = null;
  const result: Array<
    IndexedParagraph & {
      section: import("./grg-roster-consolidate").RosterSectionKey | null;
      isRosterLine: boolean;
    }
  > = [];

  for (const p of paragraphs) {
    if (/song\s+list/i.test(p.text)) {
      current = null;
      result.push({ ...p, section: null, isRosterLine: false });
      continue;
    }

    const headerSection = sectionKeyFromHeader(p.text);
    if (headerSection) {
      current = headerSection;
      result.push({ ...p, section: current, isRosterLine: false });
      continue;
    }

    const rosterLine = isRosterNameLine(p.text);
    result.push({
      ...p,
      section: rosterLine ? current : current,
      isRosterLine: rosterLine,
    });
  }

  return result;
}

function rosterBlockInSection(
  paragraphs: Array<
    IndexedParagraph & {
      section: import("./grg-roster-consolidate").RosterSectionKey | null;
      isRosterLine: boolean;
    }
  >,
  section: import("./grg-roster-consolidate").RosterSectionKey,
): IndexedParagraph[] {
  return paragraphs.filter((p) => p.section === section && p.isRosterLine);
}

function buildFilledBlockFromConsolidated(lines: ConsolidatedRosterLine[]): string {
  if (lines.length === 0) return "";
  // No trailing newline: the delete range preserves the block's final paragraph
  // mark, so the names map exactly onto it (a trailing \n would leave an empty row).
  return lines.map((l) => l.filledLine).join("\n");
}

async function fillRosterSection(
  docs: docs_v1.Docs,
  documentId: string,
  section: import("./grg-roster-consolidate").RosterSectionKey,
  lines: ConsolidatedRosterLine[],
): Promise<boolean> {
  if (lines.length === 0) return false;

  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) return false;

  const paragraphs = assignParagraphSections(collectIndexedParagraphs(body));
  const rosterLines = rosterBlockInSection(paragraphs, section);
  if (rosterLines.length === 0) return false;

  const first = rosterLines[0];
  const last = rosterLines[rosterLines.length - 1];
  const deleteStart = first.startIndex;
  const deleteEnd = last.endIndex - 1;
  if (deleteEnd <= deleteStart) return false;

  const filledBlock = buildFilledBlockFromConsolidated(lines);

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          deleteContentRange: {
            range: { startIndex: deleteStart, endIndex: deleteEnd },
          },
        },
        {
          insertText: {
            location: { index: deleteStart },
            text: filledBlock,
          },
        },
      ],
    },
  });

  return true;
}

export async function applyRosterToDocument(
  docs: docs_v1.Docs,
  documentId: string,
  roster: PlanRosterRow[],
  guestOverrides?: import("./grg-roster-consolidate").RosterSectionOverride,
  rosterSelections?: RosterSelections,
): Promise<RosterApplyResult> {
  const consolidated = consolidateRosterLines(roster, guestOverrides, rosterSelections);
  const preview = buildRosterPreviewFromPco(roster, guestOverrides, rosterSelections);

  if (consolidated.length === 0) {
    return { preview, sectionsFilled: [], updated: 0 };
  }

  const bySection = groupConsolidatedBySection(consolidated);
  const sectionsFilled: import("./grg-roster-consolidate").RosterSectionKey[] = [];
  let updated = 0;

  for (const section of ["band", "choir", "all_team"] as const) {
    const sectionLines = bySection.get(section) ?? [];
    if (sectionLines.length === 0) continue;
    const filled = await fillRosterSection(docs, documentId, section, sectionLines);
    if (filled) {
      sectionsFilled.push(section);
      updated += 1;
    }
  }

  return { preview, sectionsFilled, updated };
}

/** @deprecated Use buildRosterPreviewFromPco — preview is PCO-driven, not template-slot matching. */
export type RosterSlotMatch = {
  positionLabel: string;
  templateLine: string;
  filledLine: string | null;
  personName: string | null;
  matched: boolean;
};

/** @deprecated */
export function planRosterSlotMatches(
  _templateLines: string[],
  roster: PlanRosterRow[],
): RosterSlotMatch[] {
  return buildRosterPreviewFromPco(roster).map((entry) => ({
    positionLabel: entry.positionName,
    templateLine: ROSTER_NAME_POSITION_PLACEHOLDER,
    filledLine: entry.filledLine,
    personName: entry.displayName,
    matched: true,
  }));
}

// Re-export consolidation helpers for UI
export {
  buildFilledRosterLineMulti,
  consolidateRosterLines,
  detectRosterConflicts,
  rosterConflictGroupId,
  rosterSelectionsComplete,
  type RosterSelections,
} from "./grg-roster-consolidate";
