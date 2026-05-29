import {
  parseGrgPdfVersion,
  resolveNextGrgPdfUpload,
} from "./grg-pdf-filename";

const BASE = "Get Ready Guide 2026.05.29";

function att(id: string, filename: string) {
  return { id, filename };
}

// First upload — no existing files
{
  const next = resolveNextGrgPdfUpload({ baseStem: BASE, existing: [] });
  if (next.nextFilename !== `${BASE}.pdf` || next.attachmentIdToDelete) {
    throw new Error(`expected base pdf only, got ${JSON.stringify(next)}`);
  }
}

// Base exists → update.1
{
  const next = resolveNextGrgPdfUpload({
    baseStem: BASE,
    existing: [att("1", `${BASE}.pdf`)],
  });
  if (next.nextFilename !== `${BASE}.update.1.pdf` || next.attachmentIdToDelete !== "1") {
    throw new Error(`expected update.1, got ${JSON.stringify(next)}`);
  }
}

// update.1 exists → update.2
{
  const next = resolveNextGrgPdfUpload({
    baseStem: BASE,
    existing: [att("2", `${BASE}.update.1.pdf`)],
  });
  if (next.nextFilename !== `${BASE}.update.2.pdf` || next.attachmentIdToDelete !== "2") {
    throw new Error(`expected update.2, got ${JSON.stringify(next)}`);
  }
}

// Legacy .update.pdf counts as version 1
{
  const parsed = parseGrgPdfVersion(`${BASE}.update.pdf`, BASE);
  if (!parsed.matched || parsed.version !== 1) {
    throw new Error(`legacy .update should be version 1, got ${JSON.stringify(parsed)}`);
  }
  const next = resolveNextGrgPdfUpload({
    baseStem: BASE,
    existing: [att("3", `${BASE}.update.pdf`)],
  });
  if (next.nextFilename !== `${BASE}.update.2.pdf`) {
    throw new Error(`expected update.2 after legacy, got ${JSON.stringify(next)}`);
  }
}

// Chained .update.1.update.2 is not matched
{
  const parsed = parseGrgPdfVersion(`${BASE}.update.1.update.2.pdf`, BASE);
  if (parsed.matched) {
    throw new Error("chained update suffix should not match");
  }
}

// Unrelated PDF ignored
{
  const next = resolveNextGrgPdfUpload({
    baseStem: BASE,
    existing: [att("x", "Other Document.pdf")],
  });
  if (next.nextFilename !== `${BASE}.pdf`) {
    throw new Error(`unrelated file should not affect naming, got ${JSON.stringify(next)}`);
  }
}
