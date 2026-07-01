import {
  resolveSkipTitleExact,
  resolveSkipTitlePatterns,
  useTemplatePlaylistAssembly,
} from "@/lib/config/slide-deck";
import { isWorshipSongPlanItem } from "@/lib/pco/plan-item-filters";
import type { ServiceOrderItem } from "./types";

export type PcoExclusionReason =
  | "worship_song"
  | "section_header"
  | "template_covered"
  | "ops_meta"
  | "non_worship_song"
  | "media_not_in_deck";

/** PCO item titles already represented in Sundays Template or not deck content. */
const TEMPLATE_COVERED_TITLE_PATTERNS: RegExp[] = [
  /^welcome$/i,
  /^pastoral moment$/i,
  /^wrap-up/i,
  /^prayer of blessing$/i,
  /^sermon:/i,
];

const DEFAULT_SKIP_TITLE_PATTERNS: RegExp[] = [
  /^ProPresenter:/i,
  /^Get Ready Guide$/i,
  /^Learning Resources$/i,
  /^Playlist$/i,
];

export type PcoExclusionResult =
  | { include: true; reason: "worship_song" }
  | { include: false; reason: Exclude<PcoExclusionReason, "worship_song">; detail: string };

function matchesAnyPattern(title: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(title.trim()));
}

function envTitlePatterns(): RegExp[] {
  return resolveSkipTitlePatterns().map((raw) => {
    try {
      return new RegExp(raw, "i");
    } catch {
      return new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
  });
}

function envExactTitles(): Set<string> {
  return new Set(resolveSkipTitleExact().map((t) => t.trim().toLowerCase()).filter(Boolean));
}

export function classifyPcoForPlaylist(
  item: ServiceOrderItem,
  opts?: { useTemplateAssembly?: boolean },
): PcoExclusionResult {
  const useTemplate = opts?.useTemplateAssembly ?? useTemplatePlaylistAssembly();
  const itemType = item.itemType.trim().toLowerCase() || "item";
  const title = item.title.trim() || "(Untitled)";

  if (itemType === "header" || itemType === "note") {
    return {
      include: false,
      reason: "section_header",
      detail: "Section header — structure only, not a playlist element.",
    };
  }

  if (itemType === "song") {
    if (!isWorshipSongPlanItem(itemType, title)) {
      return {
        include: false,
        reason: "non_worship_song",
        detail: "Pre-service / opener video — excluded from worship song list.",
      };
    }
    return { include: true, reason: "worship_song" };
  }

  const exactSkips = envExactTitles();
  if (exactSkips.has(title.toLowerCase())) {
    return {
      include: false,
      reason: "ops_meta",
      detail: "Planning / ops item — not part of the Sunday deck.",
    };
  }

  const allPatterns = [...DEFAULT_SKIP_TITLE_PATTERNS, ...envTitlePatterns()];
  if (matchesAnyPattern(title, allPatterns)) {
    return {
      include: false,
      reason: "ops_meta",
      detail: "Operator or meta cue — handled outside playlist assembly.",
    };
  }

  if (matchesAnyPattern(title, TEMPLATE_COVERED_TITLE_PATTERNS)) {
    if (!useTemplate) {
      return { include: true, reason: "worship_song" };
    }
    return {
      include: false,
      reason: "template_covered",
      detail: "Already covered by Sundays Template or manual deck prep.",
    };
  }

  if (itemType === "media") {
    if (!useTemplate) {
      return { include: true, reason: "worship_song" };
    }
    return {
      include: false,
      reason: "media_not_in_deck",
      detail: "Media item — not added to deck in MVP (template covers flow).",
    };
  }

  if (!useTemplate) {
    return { include: true, reason: "worship_song" };
  }

  return {
    include: false,
    reason: "template_covered",
    detail: "Generic plan item — not a worship song; template covers service flow.",
  };
}
