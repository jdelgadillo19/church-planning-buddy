/** Shared PCO plan item filters (GRG + Slide Deck). */

export function isWorshipSongPlanItem(itemType: string, title: string): boolean {
  if (itemType.trim().toLowerCase() !== "song") return false;
  const t = title.trim().toLowerCase();
  if (/service opener|opener video|^\s*video\s*$/i.test(t)) return false;
  return true;
}
