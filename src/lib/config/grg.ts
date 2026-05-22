import { formatPlanDateForTitle } from "@/lib/pco/format-date";

export const GRG_PLACEHOLDER_DATE = "{{GRG_DATE}}";
export const GRG_PLACEHOLDER_SONG_LIST = "{{GRG_SONG_LIST}}";
export const GRG_PLACEHOLDER_SCANS_BEGIN = "{{GRG_SCANS_BEGIN}}";

export const DEFAULT_GRG_TEMPLATE_TITLE = "Get Ready Guide (TEMPLATE)";
/** Placeholder in output doc name pattern — replaced with YYYY.MM.DD from the plan. */
export const GRG_OUTPUT_DATE_PLACEHOLDER = "{{GRG_DATE}}";
export const DEFAULT_GRG_OUTPUT_TITLE_PATTERN = `Get Ready Guide ${GRG_OUTPUT_DATE_PLACEHOLDER}`;
/** Fallback when plan date is missing and pattern has no placeholder. */
export const DEFAULT_GRG_OUTPUT_TITLE = "Get Ready Guide";

export type GrgTemplateRef = {
  id?: string;
  title: string;
};

export function resolveGrgTemplateRef(overrides?: {
  templateId?: string;
  templateTitle?: string;
}): GrgTemplateRef {
  const id = overrides?.templateId?.trim() || process.env.GRG_TEMPLATE_ID?.trim();
  const title =
    overrides?.templateTitle?.trim() ||
    process.env.GRG_TEMPLATE_TITLE?.trim() ||
    DEFAULT_GRG_TEMPLATE_TITLE;
  return { id: id || undefined, title };
}

export function resolveGrgOutputTitlePattern(): string {
  const env =
    process.env.GRG_OUTPUT_TITLE?.trim() || process.env.GRG_DOC_TITLE?.trim() || "";
  if (env.includes(GRG_OUTPUT_DATE_PLACEHOLDER)) return env;
  return DEFAULT_GRG_OUTPUT_TITLE_PATTERN;
}

/** Build Drive output doc name from plan date (e.g. Get Ready Guide 2026.05.24). */
export function buildOutputDocTitle(dateRaw: string | null | undefined, pattern?: string): string {
  const pat = pattern ?? resolveGrgOutputTitlePattern();
  const datePart = formatPlanDateForTitle(dateRaw);
  if (!datePart) {
    return pat.includes(GRG_OUTPUT_DATE_PLACEHOLDER)
      ? pat.replaceAll(GRG_OUTPUT_DATE_PLACEHOLDER, "").replace(/\s+/g, " ").trim()
      : pat;
  }
  return pat.replaceAll(GRG_OUTPUT_DATE_PLACEHOLDER, datePart);
}

export function resolveGrgOutputTitle(overrides?: { grgDocTitle?: string }): string {
  return overrides?.grgDocTitle?.trim() || resolveGrgOutputTitlePattern();
}
