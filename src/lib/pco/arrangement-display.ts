/** Display name for GRG song list — from plan item arrangement, not song credits. */
export function formatArrangementDisplayName(name: string | null | undefined): string {
  const raw = name?.trim() ?? "";
  if (!raw) return "";
  return raw;
}
