import type { GoogleTokens } from "@/app/api/auth/google/_session";
import type { docs_v1 } from "@/lib/google/api-types";
import { fetchGoogleDocumentForTokens } from "@/lib/google/docs-fetch";
import {
  GRG_PLACEHOLDER_DATE,
  GRG_PLACEHOLDER_SCANS_BEGIN,
  GRG_PLACEHOLDER_SONG_LIST,
  SCAN_STYLE_TOKENS,
} from "@/lib/config/grg";
import type { PlanRosterRow } from "@/lib/pco/plan-team";
import {
  applyRosterToDocument,
  ROSTER_LINE_RE,
  sectionKeyFromHeader,
  type RosterSelections,
} from "./grg-roster";
import { appendScanSection, buildSongListLines, type SongListLine, type SongSectionInput } from "./grg-mutate";

function docEndIndex(doc: docs_v1.Schema$Document) {
  return doc.body?.content?.at(-1)?.endIndex ?? 1;
}

/** Find exact substring in body paragraphs; returns UTF-16 indices for batchUpdate. */
export function findTextRange(
  doc: docs_v1.Schema$Document,
  needle: string,
): { start: number; end: number } | null {
  for (const el of doc.body?.content ?? []) {
    const p = el.paragraph;
    if (!p || el.startIndex == null) continue;

    let text = "";
    for (const pe of p.elements ?? []) {
      text += pe.textRun?.content ?? "";
    }

    const idx = text.indexOf(needle);
    if (idx >= 0) {
      // A paragraph's text begins at its own startIndex; no +1 offset. The
      // prior +1 left the marker's first character behind on deletion.
      const start = el.startIndex + idx;
      const end = start + needle.length;
      return { start, end };
    }
  }

  return null;
}

export type GrgTemplateValidationIssue = {
  code: "missing_marker" | "missing_roster_slot" | "missing_style_token";
  marker?: string;
  section?: "band" | "choir";
  message: string;
};

export type GrgTemplateValidationResult = {
  ok: boolean;
  issues: GrgTemplateValidationIssue[];
  /** Intro placeholders missing but scans region exists — apply may use skipIntro */
  canSkipIntro: boolean;
  /** Scans placeholder present */
  canApplyScans: boolean;
};

function collectParagraphTexts(doc: docs_v1.Schema$Document): string[] {
  const lines: string[] = [];
  for (const el of doc.body?.content ?? []) {
    const p = el.paragraph;
    if (!p) continue;
    let text = "";
    for (const pe of p.elements ?? []) text += pe.textRun?.content ?? "";
    const trimmed = text.replace(/\n$/, "").trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines;
}

function auditRosterPlaceholderSlots(doc: docs_v1.Schema$Document): Array<"band" | "choir"> {
  const missing: Array<"band" | "choir"> = [];
  const lines = collectParagraphTexts(doc);
  let current: ReturnType<typeof sectionKeyFromHeader> = null;
  let sawBandHeader = false;
  let sawChoirHeader = false;
  let bandHasSlot = false;
  let choirHasSlot = false;

  for (const text of lines) {
    if (/song\s+list/i.test(text)) {
      current = null;
      continue;
    }
    const header = sectionKeyFromHeader(text);
    if (header === "band") {
      current = "band";
      sawBandHeader = true;
      continue;
    }
    if (header === "choir") {
      current = "choir";
      sawChoirHeader = true;
      continue;
    }
    if (ROSTER_LINE_RE.test(text)) {
      if (current === "band") bandHasSlot = true;
      if (current === "choir") choirHasSlot = true;
    }
  }

  if (sawBandHeader && !bandHasSlot) missing.push("band");
  if (sawChoirHeader && !choirHasSlot) missing.push("choir");
  return missing;
}

export async function validateGrgTemplate(
  tokens: GoogleTokens,
  documentId: string,
): Promise<GrgTemplateValidationResult> {
  const body = await fetchGoogleDocumentForTokens(tokens, documentId);

  const issues: GrgTemplateValidationIssue[] = [];

  const hasDate = Boolean(findTextRange(body, GRG_PLACEHOLDER_DATE));
  const hasSongList = Boolean(findTextRange(body, GRG_PLACEHOLDER_SONG_LIST));
  const hasScansBegin = Boolean(findTextRange(body, GRG_PLACEHOLDER_SCANS_BEGIN));

  if (!hasDate) {
    issues.push({
      code: "missing_marker",
      marker: GRG_PLACEHOLDER_DATE,
      message: `Missing date placeholder ${GRG_PLACEHOLDER_DATE}.`,
    });
  }
  if (!hasSongList) {
    issues.push({
      code: "missing_marker",
      marker: GRG_PLACEHOLDER_SONG_LIST,
      message: `Missing song list placeholder ${GRG_PLACEHOLDER_SONG_LIST}.`,
    });
  }
  if (!hasScansBegin) {
    issues.push({
      code: "missing_marker",
      marker: GRG_PLACEHOLDER_SCANS_BEGIN,
      message: `Missing scans placeholder ${GRG_PLACEHOLDER_SCANS_BEGIN}.`,
    });
  }

  for (const section of auditRosterPlaceholderSlots(body)) {
    issues.push({
      code: "missing_roster_slot",
      section,
      message: `${section.toUpperCase()} section has no roster placeholder line ([Name | …]: [Position]).`,
    });
  }

  // Scan style exemplars are non-blocking: apply falls back to golden defaults.
  for (const token of Object.values(SCAN_STYLE_TOKENS)) {
    if (!findTextRange(body, token)) {
      issues.push({
        code: "missing_style_token",
        marker: token,
        message: `Missing scan style exemplar ${token}; scans will use the built-in default style.`,
      });
    }
  }

  const introMarkersOk = hasDate && hasSongList;
  const canSkipIntro = hasScansBegin && !introMarkersOk;

  return {
    ok: introMarkersOk && hasScansBegin,
    issues,
    canSkipIntro,
    canApplyScans: hasScansBegin,
  };
}

/** Whether apply should abort before writing (honors skipIntro / skipScans). */
export function isTemplateValidationBlocking(
  validation: GrgTemplateValidationResult,
  options: { skipIntro?: boolean; skipScans?: boolean; hasScansToApply?: boolean },
): boolean {
  const introMissing = validation.issues.some(
    (i) =>
      i.code === "missing_marker" &&
      (i.marker === GRG_PLACEHOLDER_DATE || i.marker === GRG_PLACEHOLDER_SONG_LIST),
  );
  const scansMissing = validation.issues.some(
    (i) => i.code === "missing_marker" && i.marker === GRG_PLACEHOLDER_SCANS_BEGIN,
  );

  if (!options.skipIntro && introMissing) return true;
  if (options.hasScansToApply && !options.skipScans && scansMissing) return true;
  return false;
}

async function deleteScansRegion(docs: docs_v1.Docs, documentId: string) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) throw new Error("Could not read document for scan region delete.");

  const marker = findTextRange(body, GRG_PLACEHOLDER_SCANS_BEGIN);
  if (!marker) {
    throw new Error(
      `Template marker ${GRG_PLACEHOLDER_SCANS_BEGIN} not found. See docs/GRG-TEMPLATE.md.`,
    );
  }

  const end = docEndIndex(body);
  if (end <= marker.start + 1) return;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          deleteContentRange: {
            range: { startIndex: marker.start, endIndex: end - 1 },
          },
        },
      ],
    },
  });
}

export async function applyTemplateGrgUpdate(
  docs: docs_v1.Docs,
  documentId: string,
  input: {
    dateFormatted: string;
    songList: SongListLine[];
    sections: SongSectionInput[];
    roster?: PlanRosterRow[];
    rosterSelections?: RosterSelections;
    skipIntro?: boolean;
    skipScans?: boolean;
  },
) {
  let requestCount = 0;

  if (!input.skipIntro) {
    const songBlock = buildSongListLines(input.songList).join("\n");
    const requests: docs_v1.Schema$Request[] = [
      {
        replaceAllText: {
          containsText: { text: GRG_PLACEHOLDER_DATE, matchCase: true },
          replaceText: input.dateFormatted,
        },
      },
      {
        replaceAllText: {
          containsText: { text: GRG_PLACEHOLDER_SONG_LIST, matchCase: true },
          replaceText: songBlock,
        },
      },
    ];

    const res = await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
    requestCount += res.data.replies?.length ?? requests.length;

    if (input.roster && input.roster.length > 0) {
      const rosterResult = await applyRosterToDocument(
        docs,
        documentId,
        input.roster,
        undefined,
        input.rosterSelections,
      );
      requestCount += rosterResult.updated;
    }
  }

  if (!input.skipScans) {
    await deleteScansRegion(docs, documentId);
    requestCount += 1;

    for (const section of input.sections) {
      await appendScanSection(docs, documentId, section, true);
      requestCount += 1;
    }
  }

  return { updated: requestCount > 0, requestCount };
}
