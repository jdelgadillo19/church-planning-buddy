import type { docs_v1, drive_v3 } from "googleapis";
import { exportDocPlainText, SHARED_DRIVE_OPTS } from "@/lib/google/drive-files";
import type { ScanLineType } from "@/lib/config/grg";
import type { ScanStyleSpec } from "./scan-style-template";
import { appendScanSection } from "./grg-mutate";

export type ScanImportMode = "styled" | "plain";

export type ScanImportResult = {
  mode: ScanImportMode;
  warning?: string;
};

/** Plain-text paragraph. Run-level styling is intentionally discarded — the
 * template's {{STYLE_*}} exemplars are the source of truth for scan styling. */
type ParsedParagraph = { runs: { text: string }[] };

export type ClassifiedLine = { text: string; type: ScanLineType };

const RULE_LINE_RE = /^[―\-–—\u2014\u2500‐_]{4,}$/;
const LYRICS_START_RE = /^(VERSE|CHORUS|BRIDGE|PRE-?CHORUS|INTRO|TAG|OUTRO|CODA)\s*\d*/i;
const BAR_INTRO_RE = /^\d+\s*Bar\s/i;

function isRuleLine(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && RULE_LINE_RE.test(t);
}

function isLyricsStart(text: string): boolean {
  const t = text.trim();
  return LYRICS_START_RE.test(t) || BAR_INTRO_RE.test(t);
}

function paragraphText(p: ParsedParagraph): string {
  return p.runs.map((r) => r.text).join("").replace(/\n$/, "");
}

function parseParagraphRuns(p: docs_v1.Schema$Paragraph): { text: string }[] {
  const runs: { text: string }[] = [];
  for (const el of p.elements ?? []) {
    if (el.textRun?.content) runs.push({ text: el.textRun.content });
  }
  return runs;
}

export function splitScanParagraphs(paragraphs: ParsedParagraph[]): {
  header: ParsedParagraph[];
  lyrics: ParsedParagraph[];
} {
  let splitAt = paragraphs.length;

  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].runs.map((r) => r.text).join("").trim();
    if (isRuleLine(text)) {
      splitAt = i + 1;
      break;
    }
    if (i > 1 && isLyricsStart(text)) {
      splitAt = i;
      break;
    }
  }

  if (splitAt === paragraphs.length) {
    let afterCcli = false;
    for (let i = 0; i < paragraphs.length; i++) {
      const text = paragraphs[i].runs.map((r) => r.text).join("").trim();
      if (/ccli/i.test(text)) afterCcli = true;
      else if (afterCcli && isLyricsStart(text)) {
        splitAt = i;
        break;
      }
    }
  }

  if (splitAt === paragraphs.length && paragraphs.length > 4) {
    splitAt = Math.min(4, paragraphs.length);
  }

  return {
    header: paragraphs.slice(0, splitAt),
    lyrics: paragraphs.slice(splitAt),
  };
}

export function parseSourceDocument(doc: docs_v1.Schema$Document): {
  header: ParsedParagraph[];
  lyrics: ParsedParagraph[];
} {
  const paragraphs: ParsedParagraph[] = [];

  for (const el of doc.body?.content ?? []) {
    if (!el.paragraph) continue;
    // Keep blank paragraphs: they encode ProPresenter slide breaks in the lyrics.
    // (Leading/trailing blanks are trimmed later during classification.)
    paragraphs.push({ runs: parseParagraphRuns(el.paragraph) });
  }

  return splitScanParagraphs(paragraphs);
}

const END_MARKER_RE = /^END$/i;

function classifyLyricLine(text: string): ScanLineType {
  const t = text.trim();
  if (!t) return "lyric"; // blank slide-break line: no styling applied
  if (END_MARKER_RE.test(t)) return "bar"; // the song-ending "END" reads as a bar marker
  if (BAR_INTRO_RE.test(t)) return "bar";
  if (LYRICS_START_RE.test(t)) return "label";
  return "lyric";
}

/** Header: first non-rule line is the title; the rest are credits. */
function classifyHeaderLines(
  header: ParsedParagraph[],
  fallbackTitle: string,
): ClassifiedLine[] {
  const lines = header
    .map(paragraphText)
    .filter((t) => t.trim() && !isRuleLine(t));

  if (lines.length === 0) {
    return [{ text: fallbackTitle.trim(), type: "title" }];
  }

  return lines.map((text, i) => ({
    text,
    type: i === 0 ? "title" : "credit",
  }));
}

export function classifyLyricLines(lyrics: ParsedParagraph[]): ClassifiedLine[] {
  // Keep blank lines: each one is a ProPresenter slide break and must survive.
  // Only rule/divider lines are dropped, plus leading/trailing blanks (cosmetic).
  const lines = lyrics.map(paragraphText).filter((t) => !isRuleLine(t));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.map((text) => ({ text, type: classifyLyricLine(text) }));
}

export type DocParagraph = { start: number; end: number; text: string };
export type DocSection = {
  /** Index range of the section-break element that opens this section. The
   * canonical `updateSectionStyle` range overlaps this break (paragraph-derived
   * ranges end mid-section and are rejected with a 400). */
  breakStart: number;
  breakEnd: number;
  paras: DocParagraph[];
};

/** Group the document body into sections delimited by section-break elements. */
export function extractSections(doc: docs_v1.Schema$Document): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection | null = null;

  for (const el of doc.body?.content ?? []) {
    if (el.sectionBreak) {
      current = {
        breakStart: el.startIndex ?? 0,
        breakEnd: el.endIndex ?? el.startIndex ?? 0,
        paras: [],
      };
      sections.push(current);
      continue;
    }
    const p = el.paragraph;
    if (!p || el.startIndex == null || el.endIndex == null) continue;
    const text = (p.elements ?? [])
      .map((pe) => pe.textRun?.content ?? "")
      .join("")
      .replace(/\n$/, "");
    if (current) current.paras.push({ start: el.startIndex, end: el.endIndex, text });
  }

  return sections;
}

/** End index of the document body (exclusive). */
function bodyEndIndex(doc: docs_v1.Schema$Document): number {
  return doc.body?.content?.at(-1)?.endIndex ?? 1;
}

/** Full-width solid rule applied to the (empty) divider paragraph. */
const DIVIDER_BORDER: docs_v1.Schema$ParagraphBorder = {
  color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
  width: { magnitude: 1, unit: "PT" },
  padding: { magnitude: 0, unit: "PT" },
  dashStyle: "SOLID",
};

/**
 * Append one styled scan: a single-column header section (title + credits +
 * full-width divider) followed by a two-column lyrics section, with column
 * layout taken from the template spec. All structural inserts use
 * endOfSegmentLocation so no document indices are predicted; styling reads real
 * indices from a re-fetch, which is what makes this robust (the prior version
 * hand-computed indices across section breaks and 400d, forcing plain mode).
 */
async function appendStructuredScan(
  docs: docs_v1.Docs,
  documentId: string,
  sectionTitle: string,
  header: ParsedParagraph[],
  lyrics: ParsedParagraph[],
  addPageBreak: boolean,
  spec: ScanStyleSpec,
): Promise<void> {
  const headerLines = classifyHeaderLines(header, sectionTitle);
  const lyricLines: ClassifiedLine[] = classifyLyricLines(lyrics);

  // Header text ends with a trailing newline so the last paragraph is an empty
  // divider we border below. Lyrics text has no trailing newline (it fills the
  // empty paragraph created by the section break, leaving no stray blank line).
  const headerText = `${headerLines.map((l) => l.text).join("\n")}\n`;
  const lyricsText = lyricLines.map((l) => l.text).join("\n");

  // Capture the insertion point so Stage 1's structure can be rolled back if
  // Stage 2 styling fails (otherwise the failed styled text lingers AND the
  // caller's plain fallback appends a second copy -> the duplicate render).
  const before = await docs.documents.get({ documentId });
  if (!before.data) throw new Error("Could not read target document before scan insert.");
  const insertStart = bodyEndIndex(before.data) - 1;

  // Stage 1: structure only, all appended at the end of the body.
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertSectionBreak: {
            endOfSegmentLocation: {},
            sectionType: addPageBreak ? "NEXT_PAGE" : "CONTINUOUS",
          },
        },
        { insertText: { endOfSegmentLocation: {}, text: headerText } },
        { insertSectionBreak: { endOfSegmentLocation: {}, sectionType: "CONTINUOUS" } },
        { insertText: { endOfSegmentLocation: {}, text: lyricsText } },
      ],
    },
  });

  try {
    await styleInsertedScan(docs, documentId, spec);
  } catch (styleErr) {
    // Roll back the Stage 1 structure so the caller's plain fallback starts from
    // a clean document (no flat residue, no duplicate render).
    await rollbackInsertedScan(docs, documentId, insertStart);
    throw styleErr;
  }
}

/** Stage 2: re-read real indices, then style text + columns from the template spec. */
async function styleInsertedScan(
  docs: docs_v1.Docs,
  documentId: string,
  spec: ScanStyleSpec,
): Promise<void> {
  const after = await docs.documents.get({ documentId });
  const body = after.data;
  if (!body) throw new Error("Could not read target document after scan insert.");

  const sections = extractSections(body);
  if (sections.length < 2) throw new Error("Scan sections not found after insert.");

  const headerSection = sections[sections.length - 2];
  const lyricsSection = sections[sections.length - 1];

  const requests: docs_v1.Schema$Request[] = [];

  let sawTitle = false;
  for (const para of headerSection.paras) {
    if (!para.text.trim()) {
      // Empty trailing paragraph = divider: full-width bottom border.
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: para.start, endIndex: para.end },
          paragraphStyle: { borderBottom: DIVIDER_BORDER },
          fields: "borderBottom",
        },
      });
      continue;
    }
    const type: ScanLineType = sawTitle ? "credit" : "title";
    sawTitle = true;
    pushTextStyle(requests, para, spec[type]);
  }

  for (const para of lyricsSection.paras) {
    if (!para.text.trim()) continue;
    pushTextStyle(requests, para, spec[classifyLyricLine(para.text)]);
  }

  // Columns are applied in a single post-import pass (applyScanColumns), not
  // here: setting a section's columns and then appending the next song's section
  // break disturbs the earlier section, leaving only the final one multi-column.

  if (requests.length === 0) return;

  try {
    await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  } catch (err) {
    // Surface which request kinds were in the failing batch to make the Docs
    // API error actionable in server logs.
    const kinds = requests.map((r) => Object.keys(r)[0]).join(", ");
    console.error(
      `[scan-import] Stage 2 styling batchUpdate failed (${requests.length} requests: ${kinds}):`,
      err,
    );
    throw err;
  }
}

/** Delete everything appended since `insertStart`, restoring the prior body end. */
async function rollbackInsertedScan(
  docs: docs_v1.Docs,
  documentId: string,
  insertStart: number,
): Promise<void> {
  const current = await docs.documents.get({ documentId });
  if (!current.data) return;
  const end = bodyEndIndex(current.data);
  if (end - 1 <= insertStart) return;
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        { deleteContentRange: { range: { startIndex: insertStart, endIndex: end - 1 } } },
      ],
    },
  });
}

function pushTextStyle(
  requests: docs_v1.Schema$Request[],
  para: DocParagraph,
  entry: ScanStyleSpec[ScanLineType],
): void {
  if (!entry.fields) return;
  const endIndex = para.end - 1; // exclude the paragraph's trailing newline
  if (endIndex <= para.start) return;
  requests.push({
    updateTextStyle: {
      range: { startIndex: para.start, endIndex },
      textStyle: entry.textStyle,
      fields: entry.fields,
    },
  });
}

export function pushColumns(
  requests: docs_v1.Schema$Request[],
  section: DocSection,
  columns: docs_v1.Schema$SectionColumnProperties[],
): void {
  if (section.paras.length === 0) return;
  // updateSectionStyle's range must align to the section-break element that
  // opens the section; a paragraph-derived range ends mid-section and 400s.
  const startIndex = section.breakStart;
  const endIndex = section.breakEnd;
  if (endIndex <= startIndex) return;
  // Section column widths are auto-computed by Docs and cannot be set via the
  // API ("Column widths cannot be updated"). Only the column *count* (number of
  // entries) and optional gap (paddingEnd) are honored, so drop `width`.
  const columnProperties = columns.map((c) =>
    c.paddingEnd ? { paddingEnd: c.paddingEnd } : {},
  );
  requests.push({
    updateSectionStyle: {
      range: { startIndex, endIndex },
      sectionStyle: { columnProperties },
      fields: "columnProperties",
    },
  });
}

type SectionKind = "intro" | "header" | "lyrics" | "skip";

const CREDIT_LINE_RE = /(CCLI|^\s*By:|^\s*©)/im;
const INTRO_LINE_RE = /(Song List|Expected Platform Team|CALL\))/i;

/** Classify a section by its content so columns can be applied in one final pass. */
function classifySectionKind(section: DocSection, index: number): SectionKind {
  const texts = section.paras.map((p) => p.text).filter((t) => t.trim());
  if (texts.length === 0) return "skip";
  if (index === 0 || texts.some((t) => INTRO_LINE_RE.test(t))) return "intro";
  // A scan header carries the credit block (By:/©/CCLI); lyrics never do.
  if (texts.some((t) => CREDIT_LINE_RE.test(t))) return "header";
  return "lyrics";
}

/**
 * Apply column layout to every scan section in one pass, after all songs are
 * inserted. Done last (not per song) because appending a later song's section
 * break resets a previously-styled section's columns to single-column.
 */
export async function applyScanColumns(
  docs: docs_v1.Docs,
  documentId: string,
  spec: ScanStyleSpec,
): Promise<void> {
  const doc = await docs.documents.get({ documentId });
  if (!doc.data) return;

  const sections = extractSections(doc.data);
  const requests: docs_v1.Schema$Request[] = [];

  sections.forEach((section, index) => {
    const kind = classifySectionKind(section, index);
    if (kind === "lyrics") pushColumns(requests, section, spec.bar.columns);
    else if (kind === "header") pushColumns(requests, section, spec.title.columns);
  });

  if (requests.length === 0) return;
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
}

export function extractPlainPreview(
  doc: docs_v1.Schema$Document,
  maxLen = 1200,
): string {
  const { header, lyrics } = parseSourceDocument(doc);
  const text = [...header, ...lyrics]
    .map((p) => p.runs.map((r) => r.text).join(""))
    .join("");
  return text.slice(0, maxLen) + (text.length > maxLen ? "\n…" : "");
}

/** Best-effort mimeType lookup for diagnostics; never throws. */
async function readSourceMimeType(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<string> {
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "mimeType",
      ...SHARED_DRIVE_OPTS,
    });
    return meta.data.mimeType ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function loadSourceGoogleDoc(
  docs: docs_v1.Docs,
  drive: drive_v3.Drive,
  fileId: string,
): Promise<docs_v1.Schema$Document> {
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType,name",
    ...SHARED_DRIVE_OPTS,
  });

  const mime = meta.data.mimeType ?? "";
  if (mime !== "application/vnd.google-apps.document") {
    throw new Error(`Scan must be a Google Doc for formatted import (got ${mime || "unknown"}).`);
  }

  const doc = await docs.documents.get({ documentId: fileId });
  if (!doc.data) throw new Error("Could not load source scan document.");
  return doc.data;
}

export async function importScanSection(
  docs: docs_v1.Docs,
  drive: drive_v3.Drive,
  targetDocumentId: string,
  sourceFileId: string,
  sectionTitle: string,
  addPageBreak: boolean,
  spec: ScanStyleSpec,
): Promise<ScanImportResult> {
  try {
    const source = await loadSourceGoogleDoc(docs, drive, sourceFileId);
    const { header, lyrics } = parseSourceDocument(source);
    await appendStructuredScan(
      docs,
      targetDocumentId,
      sectionTitle,
      header,
      lyrics,
      addPageBreak,
      spec,
    );
    return { mode: "styled" };
  } catch (styledErr) {
    const sourceMime = await readSourceMimeType(drive, sourceFileId);
    console.error(
      `[scan-import] styled import failed for "${sectionTitle}" (file ${sourceFileId}, mimeType ${sourceMime}) — falling back to plain:`,
      styledErr,
    );
    const plain = await exportDocPlainText(drive, sourceFileId);
    await appendScanSection(
      docs,
      targetDocumentId,
      { title: sectionTitle, bodyText: plain },
      addPageBreak,
    );
    const msg = styledErr instanceof Error ? styledErr.message : "styled import failed";
    return { mode: "plain", warning: `${msg} [source mimeType: ${sourceMime}]` };
  }
}
