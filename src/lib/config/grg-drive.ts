/** Default Drive layout (see docs/GRG-TEMPLATE.md). Prefer GRG_*_FOLDER_ID in .env.local. */
export const DEFAULT_GRG_DRIVE_ROOT = "church-planning-buddy";
export const DEFAULT_GRG_GUIDE_FOLDER = "Get Ready Guide";
export const DEFAULT_GRG_TEMPLATE_SUBFOLDER = "Template";
export const DEFAULT_GRG_OUTPUT_SUBFOLDER = "Output";

export type GrgDriveFolderRefs = {
  templateFolderId?: string;
  outputFolderId?: string;
  templatePath: string[];
  outputPath: string[];
};

function splitPath(raw: string | undefined): string[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultGuidePath(): string[] {
  const guide = process.env.GRG_GUIDE_FOLDER?.trim() || DEFAULT_GRG_GUIDE_FOLDER;
  const root = process.env.GRG_DRIVE_ROOT?.trim() || DEFAULT_GRG_DRIVE_ROOT;
  return [root, guide];
}

/** Folder path segments from Drive root to the GRG template doc. */
export function resolveGrgTemplateFolderPath(): string[] {
  const override = splitPath(process.env.GRG_TEMPLATE_FOLDER_PATH);
  if (override) return override;
  const sub = process.env.GRG_TEMPLATE_SUBFOLDER?.trim() || DEFAULT_GRG_TEMPLATE_SUBFOLDER;
  return [...defaultGuidePath(), sub];
}

/** Folder path segments from Drive root to dated GRG output docs. */
export function resolveGrgOutputFolderPath(): string[] {
  const override = splitPath(process.env.GRG_OUTPUT_FOLDER_PATH);
  if (override) return override;
  const sub = process.env.GRG_OUTPUT_SUBFOLDER?.trim() || DEFAULT_GRG_OUTPUT_SUBFOLDER;
  return [...defaultGuidePath(), sub];
}

export function resolveGrgDriveFolderRefs(): GrgDriveFolderRefs {
  return {
    templateFolderId: process.env.GRG_TEMPLATE_FOLDER_ID?.trim() || undefined,
    outputFolderId: process.env.GRG_OUTPUT_FOLDER_ID?.trim() || undefined,
    templatePath: resolveGrgTemplateFolderPath(),
    outputPath: resolveGrgOutputFolderPath(),
  };
}
