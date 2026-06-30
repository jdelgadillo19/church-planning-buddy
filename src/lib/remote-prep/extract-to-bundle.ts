import fs from "node:fs/promises";
import path from "node:path";
import { extractStoreZip } from "@/lib/zip/extract-store-zip";
import type { ZipEntry } from "@/lib/zip/buffer-zip";

function normalizeRelPath(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\/+/, "");
}

function assertSafeRelativePath(rel: string): string {
  const normalized = normalizeRelPath(rel);
  if (!normalized || normalized.includes("..")) {
    throw new Error(`Unsafe zip path: ${rel}`);
  }
  return normalized;
}

export type ExtractFilebaseResult = {
  bundleRoot: string;
  extractedPaths: string[];
  fileCount: number;
};

/** Extract a filebase pull zip into the ProPresenter support folder. */
export async function extractFilebaseZipToBundle(input: {
  zipBytes: Buffer;
  bundleRoot: string;
}): Promise<ExtractFilebaseResult> {
  const bundleRoot = path.resolve(input.bundleRoot.trim());
  if (!bundleRoot) throw new Error("ProPresenter library folder is required.");

  await fs.mkdir(bundleRoot, { recursive: true });

  const entries = extractStoreZip(input.zipBytes);
  const extractedPaths: string[] = [];

  for (const entry of entries) {
    const rel = assertSafeRelativePath(entry.path);
    const dest = path.join(bundleRoot, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.data);
    extractedPaths.push(rel);
  }

  return {
    bundleRoot,
    extractedPaths,
    fileCount: entries.length,
  };
}

export function summarizeExtract(entries: ZipEntry[]): string {
  const libs = entries.filter((e) => normalizeRelPath(e.path).startsWith("Libraries/")).length;
  const media = entries.filter((e) => normalizeRelPath(e.path).startsWith("Media/")).length;
  return `${entries.length} files (${libs} library, ${media} media)`;
}
