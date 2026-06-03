import { resolvePlaylistNamePrefix } from "@/lib/config/slide-deck";
import { formatPlanDateForTitle } from "@/lib/pco/format-date";

/**
 * Drive subfolder name for one service handoff, e.g. `2026.06.08-SUN`.
 * Matches playlist title `SUN 2026.06.08` (prefix + date).
 */
export function buildServicePackageKey(
  dateRaw: string | null | undefined,
  prefix?: string,
): string {
  const datePart = formatPlanDateForTitle(dateRaw);
  const p = resolvePlaylistNamePrefix(prefix);
  if (!datePart) return p;
  return `${datePart}-${p}`;
}
