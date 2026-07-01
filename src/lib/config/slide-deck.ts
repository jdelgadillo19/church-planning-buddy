/** ProPresenter playlist duplicated each Sunday (legacy template assembly only). */
export const DEFAULT_PP_TEMPLATE_PLAYLIST_NAME = "Sundays Template";

/** Prefix for generated playlist names — combined with plan date as YYYY.MM.DD. */
export const DEFAULT_PP_PLAYLIST_NAME_PREFIX = "SUN";

type EnvWithStringValues = Partial<Record<string, string | undefined>>;

/**
 * Legacy mode: duplicate "Sundays Template" and inherit template slots.
 * Default false — playlists are assembled from PCO plan items matched to the library.
 */
export function useTemplatePlaylistAssembly(env: EnvWithStringValues = process.env): boolean {
  return env.PP_USE_TEMPLATE_PLAYLIST?.trim().toLowerCase() === "true";
}

export function resolveTemplatePlaylistName(override?: string): string {
  return (
    override?.trim() ||
    process.env.PP_TEMPLATE_PLAYLIST_NAME?.trim() ||
    DEFAULT_PP_TEMPLATE_PLAYLIST_NAME
  );
}

export function resolvePlaylistNamePrefix(override?: string): string {
  return (
    override?.trim() ||
    process.env.PP_PLAYLIST_NAME_PREFIX?.trim() ||
    DEFAULT_PP_PLAYLIST_NAME_PREFIX
  );
}

/** Comma-separated title substrings/patterns to skip (merged with built-in ops skips). */
export function resolveSkipTitlePatterns(): string[] {
  const raw = process.env.PP_SKIP_PCO_TITLE_PATTERNS?.trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Comma-separated exact PCO titles to skip (case-insensitive). */
export function resolveSkipTitleExact(): string[] {
  const raw = process.env.PP_SKIP_PCO_TITLE_EXACT?.trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
