import type { docs_v1 } from "googleapis";
import type { PlanRosterRow } from "@/lib/pco/plan-team";
import {
  sectionKeyFromPcoPositionName,
  type GrgRosterSection,
} from "@/lib/pco/roster-team-scope";

/** Template roster line — position comes from PCO, not the reference doc. */
export const ROSTER_NAME_POSITION_PLACEHOLDER =
  "[Name | First-name Last Initial]: [Position]";

/** Matches `[Name | …]: {anything}` roster slot lines. */
export const ROSTER_LINE_RE = /^\[Name\s*\|\s*[^\]]*\]:\s*(.+?)\s*$/i;

export type RosterSectionKey = "band" | "choir" | "all_team";

export type RosterPreviewEntry = {
  teamName: string;
  section: RosterSectionKey | "other";
  pcoPositionName: string;
  positionName: string;
  displayName: string;
  filledLine: string;
};

export type RosterApplyResult = {
  preview: RosterPreviewEntry[];
  sectionsFilled: RosterSectionKey[];
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

export function sectionKeyFromHeader(text: string): RosterSectionKey | null {
  const t = text.trim().toUpperCase();
  if (/^BAND\s*[\(:]/.test(t) || t === "BAND") return "band";
  if (/^CHOIR\s*[\(:]/.test(t) || t === "CHOIR") return "choir";
  if (/^ALL\s+TEAM/.test(t)) return "all_team";
  return null;
}

export type RosterSectionOverride = Record<string, RosterSectionKey>;

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

export function buildRosterPreviewFromPco(
  roster: PlanRosterRow[],
  guestOverrides?: RosterSectionOverride,
): RosterPreviewEntry[] {
  const entries: RosterPreviewEntry[] = [];
  for (const row of roster) {
    const section = effectiveGrgSection(row, guestOverrides);
    if (!section) continue;
    entries.push({
      teamName: row.teamName?.trim() || section.toUpperCase(),
      section,
      pcoPositionName: row.pcoPositionName,
      positionName: row.positionName,
      displayName: row.displayName,
      filledLine: buildFilledRosterLine(row.positionName, row.displayName),
    });
  }
  return entries;
}

function groupRosterBySection(
  roster: PlanRosterRow[],
  guestOverrides?: RosterSectionOverride,
): Map<RosterSectionKey, PlanRosterRow[]> {
  const map = new Map<RosterSectionKey, PlanRosterRow[]>();
  for (const row of roster) {
    const key = effectiveGrgSection(row, guestOverrides);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
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
): Array<IndexedParagraph & { section: RosterSectionKey | null; isRosterLine: boolean }> {
  let current: RosterSectionKey | null = null;
  const result: Array<IndexedParagraph & { section: RosterSectionKey | null; isRosterLine: boolean }> =
    [];

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
  paragraphs: Array<IndexedParagraph & { section: RosterSectionKey | null; isRosterLine: boolean }>,
  section: RosterSectionKey,
): IndexedParagraph[] {
  return paragraphs.filter((p) => p.section === section && p.isRosterLine);
}

function buildFilledBlock(members: PlanRosterRow[]): string {
  if (members.length === 0) return "";
  return `${members.map((m) => buildFilledRosterLine(m.positionName, m.displayName)).join("\n")}\n`;
}

async function fillRosterSection(
  docs: docs_v1.Docs,
  documentId: string,
  section: RosterSectionKey,
  members: PlanRosterRow[],
): Promise<boolean> {
  if (members.length === 0) return false;

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

  const filledBlock = buildFilledBlock(members);

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
  guestOverrides?: RosterSectionOverride,
): Promise<RosterApplyResult> {
  const preview = buildRosterPreviewFromPco(roster, guestOverrides);
  if (roster.length === 0) {
    return { preview, sectionsFilled: [], updated: 0 };
  }

  const bySection = groupRosterBySection(roster, guestOverrides);
  const sectionsFilled: RosterSectionKey[] = [];
  let updated = 0;

  for (const section of ["band", "choir", "all_team"] as const) {
    const members = bySection.get(section) ?? [];
    if (members.length === 0) continue;
    const filled = await fillRosterSection(docs, documentId, section, members);
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
