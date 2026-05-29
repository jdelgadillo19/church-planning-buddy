export const GRG_PCO_ITEM_TITLE = "Get Ready Guide";

export type GrgPdfAttachmentRef = {
  id: string;
  filename: string;
};

export type GrgPdfVersionParse = {
  /** Matches base stem and is a recognized GRG PDF name. */
  matched: boolean;
  /** 0 = base file, 1+ = .update.N (legacy .update = 1). */
  version: number;
};

/** Parse a PDF filename against the expected base stem (no .pdf). */
export function parseGrgPdfVersion(filename: string, baseStem: string): GrgPdfVersionParse {
  const base = baseStem.trim();
  if (!base) return { matched: false, version: 0 };

  const name = filename.trim();
  if (!name.toLowerCase().endsWith(".pdf")) return { matched: false, version: 0 };

  const withoutExt = name.slice(0, -4);
  if (withoutExt === base) return { matched: true, version: 0 };

  const updatePrefix = `${base}.update`;
  if (!withoutExt.startsWith(updatePrefix)) return { matched: false, version: 0 };

  const suffix = withoutExt.slice(updatePrefix.length);
  if (suffix === "") return { matched: true, version: 1 };

  if (!suffix.startsWith(".")) return { matched: false, version: 0 };

  const numPart = suffix.slice(1);
  if (!/^\d+$/.test(numPart)) return { matched: false, version: 0 };

  return { matched: true, version: Number.parseInt(numPart, 10) };
}

export type ResolveNextGrgPdfUploadInput = {
  baseStem: string;
  existing: GrgPdfAttachmentRef[];
};

export type ResolveNextGrgPdfUploadResult = {
  nextFilename: string;
  attachmentIdToDelete?: string;
};

/**
 * Decide the next PCO PDF filename and which attachment to delete (if any).
 * First upload: `{base}.pdf`. Subsequent: `{base}.update.N.pdf` with N incremented.
 */
export function resolveNextGrgPdfUpload(
  input: ResolveNextGrgPdfUploadInput,
): ResolveNextGrgPdfUploadResult {
  const baseStem = input.baseStem.trim();
  if (!baseStem) throw new Error("GRG title is required for PDF export.");

  let maxVersion = -1;
  let attachmentToDelete: GrgPdfAttachmentRef | undefined;

  for (const att of input.existing) {
    const parsed = parseGrgPdfVersion(att.filename, baseStem);
    if (!parsed.matched) continue;
    if (parsed.version > maxVersion) {
      maxVersion = parsed.version;
      attachmentToDelete = att;
    }
  }

  if (maxVersion < 0) {
    return { nextFilename: `${baseStem}.pdf` };
  }

  const nextVersion = maxVersion + 1;
  return {
    nextFilename: `${baseStem}.update.${nextVersion}.pdf`,
    attachmentIdToDelete: attachmentToDelete?.id,
  };
}
