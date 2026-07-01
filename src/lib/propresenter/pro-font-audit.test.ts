import { auditPresentationFonts } from "@/lib/propresenter/pro-font-audit";
import { normalizePresentationFonts } from "@/lib/propresenter/pro-font-normalize";

function buildProWithRtfBlocks(blocks: string[]): Buffer {
  const payload = blocks.join("\0");
  return Buffer.from(`PROHEADER\0${payload}\0TRAILER`, "utf8");
}

{
  const dominant = String.raw`{\rtf0\ansi\fonttbl{\f0\fnil NeueHaasDisplay-Bold;}\f0 Won't Stop Now}`;
  const fallback = String.raw`{\rtf0\ansi\fonttbl{\f0\fnil ArialMT;}\f0 Won't Stop Now}`;
  const bytes = buildProWithRtfBlocks([dominant, fallback, dominant, fallback]);

  const audit = auditPresentationFonts(bytes);
  if (audit.dominantFont !== "NeueHaasDisplay-Bold") {
    throw new Error(`expected NeueHaasDisplay-Bold dominant, got ${audit.dominantFont}`);
  }
  if (!audit.fallbackFonts.includes("ArialMT")) {
    throw new Error("expected ArialMT in fallback fonts");
  }
  if (audit.duplicateLyricPairs <= 0) {
    throw new Error("expected duplicate lyric pairs");
  }
}

{
  const onlyDominant = String.raw`{\rtf0\ansi\fonttbl{\f0\fnil NeueHaasDisplay-Bold;}\f0 Holy Forever}`;
  const bytes = buildProWithRtfBlocks([onlyDominant]);

  const normalized = normalizePresentationFonts(bytes);
  if (normalized.changed) {
    throw new Error("expected no-op when no duplicate fallback pattern");
  }
  if (normalized.report.removedBlocks !== 0) {
    throw new Error(`expected 0 removed blocks, got ${normalized.report.removedBlocks}`);
  }
}

{
  const dominant = String.raw`{\rtf0\ansi\fonttbl{\f0\fnil NeueHaasDisplay-Bold;}\f0 Won't Stop Now}`;
  const fallback = String.raw`{\rtf0\ansi\fonttbl{\f0\fnil ArialMT;}\f0 Won't Stop Now}`;
  const bytes = buildProWithRtfBlocks([dominant, fallback]);

  const normalized = normalizePresentationFonts(bytes);
  if (!normalized.changed) {
    throw new Error("expected normalization to change bytes");
  }
  if (normalized.report.removedBlocks !== 1) {
    throw new Error(`expected 1 removed block, got ${normalized.report.removedBlocks}`);
  }
  const latin = normalized.bytes.toString("latin1");
  if (!latin.includes("NeueHaasDisplay-Bold")) {
    throw new Error("expected dominant font block to remain");
  }
  if (latin.includes("ArialMT")) {
    throw new Error("expected ArialMT block to be removed");
  }
}

console.log("pro-font-audit.test.ts OK");
