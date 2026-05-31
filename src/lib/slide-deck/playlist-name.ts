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
