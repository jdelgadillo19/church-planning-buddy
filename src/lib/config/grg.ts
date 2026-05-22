export const GRG_PLACEHOLDER_DATE = "{{GRG_DATE}}";
export const GRG_PLACEHOLDER_SONG_LIST = "{{GRG_SONG_LIST}}";
export const GRG_PLACEHOLDER_SCANS_BEGIN = "{{GRG_SCANS_BEGIN}}";

export const DEFAULT_GRG_TEMPLATE_TITLE = "Get Ready Guide (TEMPLATE)";
export const DEFAULT_GRG_OUTPUT_TITLE = "Get Ready Guide (Good Friday)";

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

export function resolveGrgOutputTitle(overrides?: { grgDocTitle?: string }): string {
  return (
    overrides?.grgDocTitle?.trim() ||
    process.env.GRG_OUTPUT_TITLE?.trim() ||
    process.env.GRG_DOC_TITLE?.trim() ||
    DEFAULT_GRG_OUTPUT_TITLE
  );
}
