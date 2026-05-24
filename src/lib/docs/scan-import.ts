import type { docs_v1, drive_v3 } from "googleapis";
import { exportDocPlainText, SHARED_DRIVE_OPTS } from "@/lib/google/drive-files";
import { appendScanSection } from "./grg-mutate";

export type ScanImportMode = "styled" | "structure" | "plain";

export type ScanImportResult = {
  mode: ScanImportMode;
  warning?: string;
};

type StyledRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  foregroundColor?: docs_v1.Schema$OptionalColor;
  backgroundColor?: docs_v1.Schema$OptionalColor;
};

type ParsedParagraph = { runs: StyledRun[] };

const RULE_LINE_RE = /^[―\-–—\u2014\u2500‐]{4,}$/;
const LYRICS_START_RE = /^(VERSE|CHORUS|BRIDGE|PRE-?CHORUS|INTRO|TAG|OUTRO|CODA)\s*\d*/i;
const BAR_INTRO_RE = /^\d+\s*Bar\s/i;

function docEndIndex(doc: docs_v1.Schema$Document) {
  return doc.body?.content?.at(-1)?.endIndex ?? 1;
}

function isRuleLine(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && RULE_LINE_RE.test(t);
}

function isLyricsStart(text: string): boolean {
  const t = text.trim();
  return LYRICS_START_RE.test(t) || BAR_INTRO_RE.test(t);
}

function paragraphPlainText(p: docs_v1.Schema$Paragraph): string {
  let t = "";
  for (const el of p.elements ?? []) t += el.textRun?.content ?? "";
  return t.replace(/\n$/, "");
}

function parseParagraphRuns(p: docs_v1.Schema$Paragraph): StyledRun[] {
  const runs: StyledRun[] = [];
  for (const el of p.elements ?? []) {
    const tr = el.textRun;
    if (!tr?.content) continue;
    const style = tr.textStyle;
    runs.push({
      text: tr.content,
      bold: style?.bold ?? undefined,
      italic: style?.italic ?? undefined,
      underline: style?.underline ?? undefined,
      foregroundColor: style?.foregroundColor ?? undefined,
      backgroundColor: style?.backgroundColor ?? undefined,
    });
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
    const runs = parseParagraphRuns(el.paragraph);
    const plain = runs.map((r) => r.text).join("").trim();
    if (!plain && runs.every((r) => !r.text.trim())) continue;
    paragraphs.push({ runs });
  }

  return splitScanParagraphs(paragraphs);
}

function buildStyledInsertRequests(
  paragraphs: ParsedParagraph[],
  insertAt: number,
): { requests: docs_v1.Schema$Request[]; endIndex: number } {
  const requests: docs_v1.Schema$Request[] = [];
  let index = insertAt;

  for (const para of paragraphs) {
    const fullText = para.runs.map((r) => r.text).join("");
    if (!fullText.trim()) continue;

    requests.push({ insertText: { location: { index }, text: fullText } });

    let offset = 0;
    for (const run of para.runs) {
      const len = run.text.length;
      if (len === 0) continue;

      const start = index + offset;
      const end = start + len;
      const style: docs_v1.Schema$TextStyle = {};
      const fields: string[] = [];

      if (run.bold) {
        style.bold = true;
        fields.push("bold");
      }
      if (run.italic) {
        style.italic = true;
        fields.push("italic");
      }
      if (run.underline) {
        style.underline = true;
        fields.push("underline");
      }
      if (run.foregroundColor) {
        style.foregroundColor = run.foregroundColor;
        fields.push("foregroundColor");
      }
      if (run.backgroundColor) {
        style.backgroundColor = run.backgroundColor;
        fields.push("backgroundColor");
      }

      if (fields.length > 0 && end > start) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: start, endIndex: end },
            textStyle: style,
            fields: fields.join(","),
          },
        });
      }

      offset += len;
    }

    index += fullText.length;
  }

  return { requests, endIndex: index };
}

function headerParagraphsFromTitle(
  sectionTitle: string,
  sourceHeader: ParsedParagraph[],
): ParsedParagraph[] {
  if (sourceHeader.length > 0) return sourceHeader;

  const title = `${sectionTitle.trim()}\n`;
  const rule = "――――――――――――――――――――\n";
  return [
    { runs: [{ text: title, bold: true }] },
    { runs: [{ text: rule }] },
  ];
}

async function applyTwoColumnSectionStyle(
  docs: docs_v1.Docs,
  documentId: string,
  sectionStartIndex: number,
) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) return;

  const end = docEndIndex(body);
  if (end <= sectionStartIndex + 1) return;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          updateSectionStyle: {
            range: { startIndex: sectionStartIndex, endIndex: end - 1 },
            sectionStyle: {
              columnProperties: [
                { width: { magnitude: 234, unit: "PT" } },
                { width: { magnitude: 234, unit: "PT" } },
              ],
            },
            fields: "columnProperties",
          },
        },
      ],
    },
  });
}

async function appendStructuredScan(
  docs: docs_v1.Docs,
  documentId: string,
  sectionTitle: string,
  header: ParsedParagraph[],
  lyrics: ParsedParagraph[],
  addPageBreak: boolean,
  applyStyles: boolean,
): Promise<void> {
  const target = await docs.documents.get({ documentId });
  const body = target.data;
  if (!body) throw new Error("Could not read target document for scan import.");

  let insertAt = docEndIndex(body) - 1;
  const requests: docs_v1.Schema$Request[] = [];

  if (addPageBreak) {
    requests.push({ insertPageBreak: { location: { index: insertAt } } });
    insertAt += 1;
  }

  const headerParas = headerParagraphsFromTitle(sectionTitle, header);
  const headerInsert = applyStyles
    ? buildStyledInsertRequests(headerParas, insertAt)
    : {
        requests: [
          {
            insertText: {
              location: { index: insertAt },
              text: headerParas.map((p) => p.runs.map((r) => r.text).join("")).join(""),
            },
          },
        ] as docs_v1.Schema$Request[],
        endIndex:
          insertAt +
          headerParas.map((p) => p.runs.map((r) => r.text).join("")).join("").length,
      };

  requests.push(...headerInsert.requests);

  const afterHeader = headerInsert.endIndex;
  requests.push({
    insertSectionBreak: {
      location: { index: afterHeader },
      sectionType: "CONTINUOUS",
    },
  });

  const lyricsStart = afterHeader + 1;
  const lyricsParas =
    lyrics.length > 0 ? lyrics : [{ runs: [{ text: "\n" }] }];

  const lyricsInsert = applyStyles
    ? buildStyledInsertRequests(lyricsParas, lyricsStart)
    : {
        requests: [
          {
            insertText: {
              location: { index: lyricsStart },
              text: lyricsParas.map((p) => p.runs.map((r) => r.text).join("")).join(""),
            },
          },
        ] as docs_v1.Schema$Request[],
        endIndex:
          lyricsStart + lyricsParas.map((p) => p.runs.map((r) => r.text).join("")).join("").length,
      };

  requests.push(...lyricsInsert.requests);

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });

  await applyTwoColumnSectionStyle(docs, documentId, lyricsStart);
}

export function extractPlainPreview(
  doc: docs_v1.Schema$Document,
  maxLen = 1200,
): string {
  const { header, lyrics } = parseSourceDocument(doc);
  const text = [...header, ...lyrics].map((p) => p.runs.map((r) => r.text).join("")).join("");
  return text.slice(0, maxLen) + (text.length > maxLen ? "\n…" : "");
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
): Promise<ScanImportResult> {
  try {
    const source = await loadSourceGoogleDoc(docs, drive, sourceFileId);
    const { header, lyrics } = parseSourceDocument(source);
    await appendStructuredScan(docs, targetDocumentId, sectionTitle, header, lyrics, addPageBreak, true);
    return { mode: "styled" };
  } catch (styledErr) {
    try {
      const source = await loadSourceGoogleDoc(docs, drive, sourceFileId);
      const { header, lyrics } = parseSourceDocument(source);
      await appendStructuredScan(docs, targetDocumentId, sectionTitle, header, lyrics, addPageBreak, false);
      const msg = styledErr instanceof Error ? styledErr.message : "styled import failed";
      return { mode: "structure", warning: msg };
    } catch (structureErr) {
      const plain = await exportDocPlainText(drive, sourceFileId);
      await appendScanSection(
        docs,
        targetDocumentId,
        { title: sectionTitle, bodyText: plain },
        addPageBreak,
      );
      const msg =
        structureErr instanceof Error ? structureErr.message : "structured import failed";
      return { mode: "plain", warning: msg };
    }
  }
}
