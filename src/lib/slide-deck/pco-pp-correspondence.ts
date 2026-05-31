import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";

export type TemplateCorrespondenceStatus = "matched" | "not_found" | "ambiguous";

export type TemplateCorrespondence = {
  pcoTitle: string;
  ppItemName?: string;
  ppItemId?: string;
  status: TemplateCorrespondenceStatus;
  note?: string;
};

/** PCO plan item title → ProPresenter template playlist item. */
type CorrespondenceRule = {
  id: string;
  pcoPattern: RegExp;
  ppPattern: RegExp;
};

const DEFAULT_CORRESPONDENCE_RULES: CorrespondenceRule[] = [
  { id: "welcome", pcoPattern: /^welcome$/i, ppPattern: /\bwelcome\b/i },
  { id: "sermon", pcoPattern: /^sermon:/i, ppPattern: /\bsermon\b/i },
  { id: "wrap-up", pcoPattern: /^wrap-up/i, ppPattern: /wrap-up/i },
  { id: "prayer", pcoPattern: /^prayer of blessing$/i, ppPattern: /prayer|blessing/i },
  { id: "pastoral", pcoPattern: /^pastoral moment$/i, ppPattern: /pastoral/i },
];

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/-sundays\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findTemplateMatches(
  ppPattern: RegExp,
  templateItems: PpPlaylistItemRef[],
): PpPlaylistItemRef[] {
  return templateItems.filter((item) => ppPattern.test(item.name));
}

/**
 * Resolve which ProPresenter template playlist item corresponds to a PCO plan item.
 * Used for Welcome, Sermon, Wrap-up, etc. — not worship songs.
 */
export function resolveTemplateCorrespondence(
  pcoTitle: string,
  templateItems: PpPlaylistItemRef[],
  rules: CorrespondenceRule[] = DEFAULT_CORRESPONDENCE_RULES,
): TemplateCorrespondence {
  const title = pcoTitle.trim() || "(Untitled)";

  for (const rule of rules) {
    if (!rule.pcoPattern.test(title)) continue;

    const matches = findTemplateMatches(rule.ppPattern, templateItems);
    if (matches.length === 1) {
      return {
        pcoTitle: title,
        ppItemName: matches[0]!.name,
        ppItemId: matches[0]!.id,
        status: "matched",
      };
    }
    if (matches.length > 1) {
      return {
        pcoTitle: title,
        status: "ambiguous",
        note: `Multiple template matches: ${matches.map((m) => m.name).join("; ")}`,
      };
    }

    // Fallback: normalized core label (e.g. "Welcome" ↔ "WELCOME-Sundays")
    const pcoCore = normalizeLabel(title);
    const fuzzy = templateItems.filter((item) => {
      const ppCore = normalizeLabel(item.name);
      return ppCore.includes(pcoCore) || pcoCore.includes(ppCore);
    });
    if (fuzzy.length === 1) {
      return {
        pcoTitle: title,
        ppItemName: fuzzy[0]!.name,
        ppItemId: fuzzy[0]!.id,
        status: "matched",
        note: "Fuzzy label match.",
      };
    }
    if (fuzzy.length > 1) {
      return {
        pcoTitle: title,
        status: "ambiguous",
        note: `Fuzzy ambiguous: ${fuzzy.map((m) => m.name).join("; ")}`,
      };
    }

    return {
      pcoTitle: title,
      status: "not_found",
      note: `No template item matched rule "${rule.id}".`,
    };
  }

  return {
    pcoTitle: title,
    status: "not_found",
    note: "No correspondence rule for this PCO item.",
  };
}

/** Template items that precede the Welcome slot (Countdown, Video Opener, etc.). */
export function templatePrefixBeforeWelcome(
  templateItems: PpPlaylistItemRef[],
): PpPlaylistItemRef[] {
  const welcomeIdx = templateItems.findIndex((item) => /\bwelcome\b/i.test(item.name));
  if (welcomeIdx <= 0) return welcomeIdx === 0 ? [] : templateItems;
  return templateItems.slice(0, welcomeIdx);
}

export function findTemplateItemById(
  templateItems: PpPlaylistItemRef[],
  id: string,
): PpPlaylistItemRef | undefined {
  return templateItems.find((item) => item.id === id);
}
