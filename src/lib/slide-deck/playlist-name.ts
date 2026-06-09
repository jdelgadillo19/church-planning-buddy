import { resolvePlaylistNamePrefix } from "@/lib/config/slide-deck";
import { formatPlanDateForTitle } from "@/lib/pco/format-date";

/** Build target playlist name: `SUN 2026.05.31` */
export function buildPlaylistNameFromPlanDate(
  dateRaw: string | null | undefined,
  prefix?: string,
): string {
  const p = resolvePlaylistNamePrefix(prefix);
  const datePart = formatPlanDateForTitle(dateRaw);
  if (!datePart) return p;
  return `${p} ${datePart}`;
}

/** Recover PCO-style date from playlist title (`SUN 2026.06.14` → `2026-06-14`). */
export function parseServiceDateFromPlaylistName(playlistName: string): string {
  const dotted = playlistName.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (dotted) return `${dotted[1]}-${dotted[2]}-${dotted[3]}`;

  const iso = playlistName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return playlistName.trim();
}
