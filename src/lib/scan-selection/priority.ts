import { isMasterScanName } from "@/lib/pco/scans";

/** Multi-character pitch keys (boundary match). Single letters use explicit patterns only. */
const PITCH_KEYS_MULTI = ["Ab", "A#", "Bb", "C#", "Db", "D#", "Eb", "F#", "Gb", "G#"] as const;

function escapeRegex(s: string) {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when the filename likely encodes a key signature (de-prioritized, not excluded). */
export function filenameHasKeySignature(name: string): boolean {
  const n = name.trim();
  if (!n) return false;

  if (/\bkey\s*of\s+[a-g](#|b)?\b/i.test(n)) return true;
  if (/\bin\s+[a-g](#|b)?\b/i.test(n)) return true;
  if (/\s-\s*[a-g](#|b)?\s*$/i.test(n)) return true;
  if (/\(\s*[a-g](#|b)?\s*\)\s*$/i.test(n)) return true;

  for (const key of PITCH_KEYS_MULTI) {
    const re = new RegExp(`(?:^|[\\s(,\\-–—])${escapeRegex(key)}(?:[\\s),\\-–—]|$)`, "i");
    if (re.test(n)) return true;
  }

  return false;
}

/** Higher score = more preferred for GRG incorporation. */
export function scoreScanFilename(name: string): number {
  let score = 0;
  const lower = name.toLowerCase();

  if (lower.includes("blank")) score += 40;
  if (isMasterScanName(name)) score += 30;
  if (lower.includes("song scan") || lower.replaceAll(/\s+/g, "").includes("songscan")) score += 10;
  if (!filenameHasKeySignature(name)) score += 25;
  else score -= 25;

  return score;
}

export type ScoredItem = { id: string; score: number };

/** Pick the sole top-scoring item when it strictly beats the runner-up. */
export function pickClearFrontrunner<T extends ScoredItem>(items: T[]): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const sorted = [...items].toSorted((a, b) => b.score - a.score);
  if (sorted[0].score > sorted[1].score) return sorted[0];
  return null;
}

export function sortByScanPriority<T extends { name: string }>(items: T[]): Array<T & { priorityScore: number }> {
  return items
    .map((item) => ({ ...item, priorityScore: scoreScanFilename(item.name) }))
    .toSorted((a, b) => b.priorityScore - a.priorityScore);
}
