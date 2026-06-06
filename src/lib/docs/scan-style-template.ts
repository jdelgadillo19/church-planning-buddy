import type { docs_v1 } from "@/lib/google/api-types";
import { SCAN_STYLE_TOKENS, type ScanLineType } from "@/lib/config/grg";

/** A captured run style plus the field mask to apply it with `updateTextStyle`,
 * and the column layout of the template section the token lived in. */
export type ScanStyleEntry = {
  textStyle: docs_v1.Schema$TextStyle;
  /** Comma-joined field mask for `updateTextStyle.fields`. */
  fields: string;
  /** Column layout for this line type's section (single entry = one column). */
  columns: docs_v1.Schema$SectionColumnProperties[];
};

export type ScanStyleSpec = Record<ScanLineType, ScanStyleEntry>;

export type ScanStyleCaptureResult = {
  spec: ScanStyleSpec;
  /** Line types whose `{{STYLE_*}}` token was absent (defaults used). */
  missing: ScanLineType[];
};

/** Letter page, 1in margins = two 234pt columns. Fallback only. */
const DEFAULT_CONTENT_WIDTH_PT = 468;
const DEFAULT_LYRIC_COLUMN_WIDTH_PT = 234;

const SINGLE_COLUMN_DEFAULT: docs_v1.Schema$SectionColumnProperties[] = [
  { width: { magnitude: DEFAULT_CONTENT_WIDTH_PT, unit: "PT" } },
];
const TWO_COLUMN_DEFAULT: docs_v1.Schema$SectionColumnProperties[] = [
  { width: { magnitude: DEFAULT_LYRIC_COLUMN_WIDTH_PT, unit: "PT" } },
  { width: { magnitude: DEFAULT_LYRIC_COLUMN_WIDTH_PT, unit: "PT" } },
];

/** Golden-matching fallbacks used when a template token is missing. Sizes in PT. */
const DEFAULT_SPEC: ScanStyleSpec = {
  title: {
    textStyle: {
      bold: true,
      fontSize: { magnitude: 14, unit: "PT" },
      foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
    },
    fields: "bold,fontSize,foregroundColor",
    columns: SINGLE_COLUMN_DEFAULT,
  },
  credit: {
    textStyle: {
      bold: false,
      fontSize: { magnitude: 9, unit: "PT" },
      weightedFontFamily: { fontFamily: "Helvetica Neue" },
      foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
    },
    fields: "bold,fontSize,weightedFontFamily,foregroundColor",
    columns: SINGLE_COLUMN_DEFAULT,
  },
  bar: {
    textStyle: {
      bold: true,
      fontSize: { magnitude: 12, unit: "PT" },
      foregroundColor: {
        color: { rgbColor: { red: 1, green: 0, blue: 0 } },
      },
    },
    fields: "bold,fontSize,foregroundColor",
    columns: TWO_COLUMN_DEFAULT,
  },
  label: {
    textStyle: {
      bold: true,
      fontSize: { magnitude: 12, unit: "PT" },
      foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
      backgroundColor: {
        color: { rgbColor: { red: 1, green: 1, blue: 0 } },
      },
    },
    fields: "bold,fontSize,foregroundColor,backgroundColor",
    columns: TWO_COLUMN_DEFAULT,
  },
  lyric: {
    textStyle: {
      bold: false,
      fontSize: { magnitude: 12, unit: "PT" },
      foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
    },
    fields: "bold,fontSize,foregroundColor",
    columns: TWO_COLUMN_DEFAULT,
  },
};

const LINE_TYPES = Object.keys(SCAN_STYLE_TOKENS) as ScanLineType[];

function docEndIndex(doc: docs_v1.Schema$Document) {
  return doc.body?.content?.at(-1)?.endIndex ?? 1;
}

/** First run's text style for the paragraph that contains `needle`, or null. */
function styleForToken(
  doc: docs_v1.Schema$Document,
  needle: string,
): docs_v1.Schema$TextStyle | null {
  for (const el of doc.body?.content ?? []) {
    const p = el.paragraph;
    if (!p) continue;
    const text = (p.elements ?? [])
      .map((pe) => pe.textRun?.content ?? "")
      .join("");
    if (!text.includes(needle)) continue;
    for (const pe of p.elements ?? []) {
      if (pe.textRun?.content?.includes(needle) && pe.textRun.textStyle) {
        return pe.textRun.textStyle;
      }
    }
    // Token present but no styled run: fall back to first run's style.
    return p.elements?.find((pe) => pe.textRun)?.textRun?.textStyle ?? null;
  }
  return null;
}

/** Build a `{ textStyle, fields }` entry from a captured run style. */
function entryFromTextStyle(
  style: docs_v1.Schema$TextStyle,
  columns: docs_v1.Schema$SectionColumnProperties[],
): ScanStyleEntry {
  const textStyle: docs_v1.Schema$TextStyle = {};
  const fields: string[] = [];

  const carry = <K extends keyof docs_v1.Schema$TextStyle>(key: K) => {
    if (style[key] != null) {
      textStyle[key] = style[key];
      fields.push(key);
    }
  };

  carry("bold");
  carry("italic");
  carry("underline");
  carry("fontSize");
  carry("weightedFontFamily");
  carry("foregroundColor");
  carry("backgroundColor");

  // Always pin a foreground color. Inserted text inherits the style of the
  // character before it, so without an explicit color a non-red line (lyric,
  // label, title, credit) lets the previous song's red bar marker bleed in.
  if (!fields.includes("foregroundColor")) {
    textStyle.foregroundColor = { color: { rgbColor: { red: 0, green: 0, blue: 0 } } };
    fields.push("foregroundColor");
  }

  return { textStyle, fields: fields.join(","), columns };
}

/** Content width (PT) from the document's page size and side margins. */
function contentWidthPt(doc: docs_v1.Schema$Document): number {
  const style = doc.documentStyle;
  const pageWidth = style?.pageSize?.width?.magnitude;
  const left = style?.marginLeft?.magnitude ?? 0;
  const right = style?.marginRight?.magnitude ?? 0;
  if (pageWidth == null) return DEFAULT_CONTENT_WIDTH_PT;
  const width = pageWidth - left - right;
  return width > 0 ? width : DEFAULT_CONTENT_WIDTH_PT;
}

/**
 * Column layout of the section each token sits in. Walks content tracking the
 * current section's columnProperties (set by each section break) and records it
 * when a token paragraph is reached.
 */
function columnsByToken(
  doc: docs_v1.Schema$Document,
): Map<string, docs_v1.Schema$SectionColumnProperties[] | undefined> {
  const result = new Map<string, docs_v1.Schema$SectionColumnProperties[] | undefined>();
  const tokens = Object.values(SCAN_STYLE_TOKENS);
  let current: docs_v1.Schema$SectionColumnProperties[] | undefined;

  for (const el of doc.body?.content ?? []) {
    if (el.sectionBreak) {
      current = el.sectionBreak.sectionStyle?.columnProperties ?? undefined;
      continue;
    }
    const p = el.paragraph;
    if (!p) continue;
    const text = (p.elements ?? [])
      .map((pe) => pe.textRun?.content ?? "")
      .join("");
    for (const token of tokens) {
      if (text.includes(token) && !result.has(token)) result.set(token, current);
    }
  }

  return result;
}

/** Use the template's column array if it has entries; else force a single column. */
function resolveColumns(
  columns: docs_v1.Schema$SectionColumnProperties[] | undefined,
  contentWidth: number,
): docs_v1.Schema$SectionColumnProperties[] {
  if (columns && columns.length >= 1) return columns;
  return [{ width: { magnitude: contentWidth, unit: "PT" } }];
}

/**
 * Read each `{{STYLE_*}}` exemplar's run style from the (just-copied) output doc
 * into a `ScanStyleSpec`. Missing tokens fall back to golden-matching defaults.
 */
export async function captureScanStyleSpec(
  docs: docs_v1.Docs,
  documentId: string,
): Promise<ScanStyleCaptureResult> {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) throw new Error("Could not read document for scan style capture.");

  const spec = { ...DEFAULT_SPEC } as ScanStyleSpec;
  const missing: ScanLineType[] = [];
  const contentWidth = contentWidthPt(body);
  const tokenColumns = columnsByToken(body);

  for (const lineType of LINE_TYPES) {
    const token = SCAN_STYLE_TOKENS[lineType];
    const style = styleForToken(body, token);
    if (style && Object.keys(style).length > 0) {
      const columns = resolveColumns(tokenColumns.get(token), contentWidth);
      spec[lineType] = entryFromTextStyle(style, columns);
    } else {
      missing.push(lineType);
    }
  }

  return { spec, missing };
}

/**
 * Remove the contiguous `{{STYLE_*}}` exemplar block (first style token paragraph
 * through end of document). Keeps `{{GRG_SCANS_BEGIN}}` intact so the scan append
 * still has its anchor. Safe to call when no tokens are present.
 */
export async function removeScanStyleExemplars(
  docs: docs_v1.Docs,
  documentId: string,
): Promise<void> {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) return;

  const tokens = new Set(Object.values(SCAN_STYLE_TOKENS));
  let startIndex: number | null = null;
  for (const el of body.body?.content ?? []) {
    const p = el.paragraph;
    if (!p || el.startIndex == null) continue;
    const text = (p.elements ?? [])
      .map((pe) => pe.textRun?.content ?? "")
      .join("");
    if ([...tokens].some((tok) => text.includes(tok))) {
      startIndex = el.startIndex;
      break;
    }
  }

  if (startIndex == null) return;

  const end = docEndIndex(body);
  if (end <= startIndex + 1) return;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          deleteContentRange: {
            range: { startIndex, endIndex: end - 1 },
          },
        },
      ],
    },
  });
}
