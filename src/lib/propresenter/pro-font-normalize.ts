import { auditPresentationFonts, extractRtfBlockRangesFromLatin } from "@/lib/propresenter/pro-font-audit";

export type ProFontNormalizeReport = {
  changed: boolean;
  dominantFont: string | null;
  removedBlocks: number;
  duplicatePairs: number;
};

const FALLBACK_FONT_RE =
  /^(ArialMT?|Arial|Helvetica|Helvetica Neue|\.AppleSystemUIFont)$/i;

function isFallbackFont(name: string): boolean {
  return FALLBACK_FONT_RE.test(name.trim());
}

function extractRtfBlocksWithOffsets(
  bytes: Buffer,
): Array<{ start: number; end: number; text: string }> {
  return extractRtfBlockRangesFromLatin(bytes.toString("latin1"));
}

function parseFontTable(rtf: string): Map<number, string> {
  const table = new Map<number, string>();
  const entryRe = /\\f(\d+)\\fnil\s+([^;\\}]+);/gi;
  let entry: RegExpExecArray | null;
  while ((entry = entryRe.exec(rtf)) !== null) {
    table.set(Number.parseInt(entry[1]!, 10), entry[2]!.trim());
  }
  return table;
}

function fontForBlock(rtf: string, fontTable: Map<number, string>): string | null {
  const afterTable = rtf.includes("\\fonttbl") ? rtf.split("\\fonttbl", 2)[1] : rtf;
  if (!afterTable) return null;
  const useMatch = /\\f(\d+)/.exec(afterTable);
  if (!useMatch) return null;
  return fontTable.get(Number.parseInt(useMatch[1]!, 10)) ?? null;
}

function rtfPlainText(rtf: string): string {
  let body = rtf.replace(/\\fonttbl\{[\s\S]*?\}/gi, " ");
  body = body.replace(/\\par\b/g, " ");
  body = body.replace(/\\'[0-9a-fA-F]{2}/g, " ");
  body = body.replace(/\\[a-zA-Z]+-?\d*\s?/g, " ");
  body = body.replace(/[{}]/g, " ");
  return body.replace(/\s+/g, " ").trim();
}

export function normalizePresentationFonts(bytes: Buffer): {
  bytes: Buffer;
  changed: boolean;
  report: ProFontNormalizeReport;
} {
  const audit = auditPresentationFonts(bytes);
  const dominantFont = audit.dominantFont;
  const duplicatePairs = audit.duplicateLyricPairs;

  if (!dominantFont || duplicatePairs === 0) {
    return {
      bytes,
      changed: false,
      report: {
        changed: false,
        dominantFont,
        removedBlocks: 0,
        duplicatePairs,
      },
    };
  }

  const blocks = extractRtfBlocksWithOffsets(bytes);
  const dominantTexts = new Set<string>();
  for (const block of blocks) {
    const table = parseFontTable(block.text);
    const font = fontForBlock(block.text, table);
    if (font !== dominantFont) continue;
    const plain = rtfPlainText(block.text);
    if (plain.length >= 8) dominantTexts.add(plain.toLowerCase());
  }

  const removeRanges: Array<{ start: number; end: number }> = [];
  for (const block of blocks) {
    const table = parseFontTable(block.text);
    const font = fontForBlock(block.text, table);
    if (!font || !isFallbackFont(font)) continue;
    const plain = rtfPlainText(block.text);
    if (plain.length < 8) continue;
    if (dominantTexts.has(plain.toLowerCase())) {
      removeRanges.push({ start: block.start, end: block.end });
    }
  }

  if (removeRanges.length === 0) {
    return {
      bytes,
      changed: false,
      report: {
        changed: false,
        dominantFont,
        removedBlocks: 0,
        duplicatePairs,
      },
    };
  }

  removeRanges.sort((a, b) => b.start - a.start);
  let out = Buffer.from(bytes);
  for (const range of removeRanges) {
    out = Buffer.concat([
      out.subarray(0, range.start),
      out.subarray(range.end),
    ]);
  }

  return {
    bytes: out,
    changed: true,
    report: {
      changed: true,
      dominantFont,
      removedBlocks: removeRanges.length,
      duplicatePairs,
    },
  };
}
