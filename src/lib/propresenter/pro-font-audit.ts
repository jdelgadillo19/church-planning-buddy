const FALLBACK_FONT_RE =
  /^(ArialMT?|Arial|Helvetica|Helvetica Neue|\.AppleSystemUIFont)$/i;

export type ProFontAuditReport = {
  rtfBlockCount: number;
  fontsInTable: string[];
  fontUsage: Record<string, number>;
  dominantFont: string | null;
  fallbackFonts: string[];
  duplicateLyricPairs: number;
};

export function extractRtfBlockRangesFromLatin(
  text: string,
): Array<{ start: number; end: number; text: string }> {
  const blocks: Array<{ start: number; end: number; text: string }> = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf("{\\rtf0", searchFrom);
    if (start === -1) break;
    let depth = 0;
    let end = start;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > start) {
      blocks.push({ start, end, text: text.slice(start, end) });
      searchFrom = end;
    } else {
      searchFrom = start + 1;
    }
  }
  return blocks;
}

function extractRtfBlocks(bytes: Buffer): string[] {
  const text = bytes.toString("latin1");
  return extractRtfBlockRangesFromLatin(text).map((block) => block.text);
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

function rtfPlainText(rtf: string): string {
  let body = rtf.replace(/\\fonttbl\{[\s\S]*?\}/gi, " ");
  body = body.replace(/\\par\b/g, " ");
  body = body.replace(/\\'[0-9a-fA-F]{2}/g, " ");
  body = body.replace(/\\[a-zA-Z]+-?\d*\s?/g, " ");
  body = body.replace(/[{}]/g, " ");
  return body.replace(/\s+/g, " ").trim();
}

function fontForBlock(rtf: string, fontTable: Map<number, string>): string | null {
  const afterTable = rtf.includes("\\fonttbl") ? rtf.split("\\fonttbl", 2)[1] : rtf;
  if (!afterTable) return null;
  const useMatch = /\\f(\d+)/.exec(afterTable);
  if (!useMatch) return null;
  return fontTable.get(Number.parseInt(useMatch[1]!, 10)) ?? null;
}

function isFallbackFont(name: string): boolean {
  return FALLBACK_FONT_RE.test(name.trim());
}

export function auditPresentationFonts(bytes: Buffer): ProFontAuditReport {
  const blocks = extractRtfBlocks(bytes);
  const fontUsage: Record<string, number> = {};
  const fontsInTable = new Set<string>();
  const blockFonts: Array<{ font: string; text: string }> = [];

  for (const block of blocks) {
    const table = parseFontTable(block);
    for (const family of table.values()) {
      fontsInTable.add(family);
    }
    const font = fontForBlock(block, table);
    if (!font) continue;
    fontUsage[font] = (fontUsage[font] ?? 0) + 1;
    const text = rtfPlainText(block);
    if (text.length >= 8) {
      blockFonts.push({ font, text });
    }
  }

  const nonFallback = Object.entries(fontUsage)
    .filter(([name]) => !isFallbackFont(name))
    .sort((a, b) => b[1] - a[1]);

  const dominantFont = nonFallback[0]?.[0] ?? null;
  const fallbackFonts = Object.keys(fontUsage).filter(isFallbackFont);

  const dominantTexts = new Set(
    blockFonts.filter((b) => b.font === dominantFont).map((b) => b.text.toLowerCase()),
  );
  let duplicateLyricPairs = 0;
  for (const block of blockFonts) {
    if (!isFallbackFont(block.font)) continue;
    if (dominantTexts.has(block.text.toLowerCase())) {
      duplicateLyricPairs += 1;
    }
  }

  return {
    rtfBlockCount: blocks.length,
    fontsInTable: [...fontsInTable],
    fontUsage,
    dominantFont,
    fallbackFonts,
    duplicateLyricPairs,
  };
}
