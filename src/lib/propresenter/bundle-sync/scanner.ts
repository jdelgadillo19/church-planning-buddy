import fs from "node:fs/promises";
import path from "node:path";
import type { BundleFileRecord, BundleScanResult, BundleSnapshot } from "./types";
import {
  BUNDLE_SCAN_EXCLUDE_DIRS,
  BUNDLE_SCAN_EXCLUDE_GLOBS,
  resolveBundleRoot,
} from "./config";

const MAX_DEPTH = 12;
const WALK_ROOTS = ["Libraries", "Playlists"] as const;

function shouldSkipDir(name: string): boolean {
  return BUNDLE_SCAN_EXCLUDE_DIRS.has(name.toLowerCase());
}

function shouldSkipFile(name: string): boolean {
  const lower = name.toLowerCase();
  return BUNDLE_SCAN_EXCLUDE_GLOBS.some((g) => lower.endsWith(g) || lower === g);
}

async function walkDir(
  absDir: string,
  relativePrefix: string,
  depth: number,
  files: BundleFileRecord[],
  warnings: string[],
  skippedPaths: { count: number },
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch (e) {
    warnings.push(
      `Could not read ${relativePrefix || absDir}: ${e instanceof Error ? e.message : String(e)}`,
    );
    skippedPaths.count += 1;
    return;
  }

  for (const ent of entries) {
    const rel = relativePrefix ? `${relativePrefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      await walkDir(path.join(absDir, ent.name), rel, depth + 1, files, warnings, skippedPaths);
      continue;
    }
    if (!ent.isFile() || shouldSkipFile(ent.name)) continue;

    try {
      const stat = await fs.stat(path.join(absDir, ent.name));
      files.push({
        relativePath: rel.replace(/\\/g, "/"),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    } catch (e) {
      warnings.push(`Skip file ${rel}: ${e instanceof Error ? e.message : String(e)}`);
      skippedPaths.count += 1;
    }
  }
}

export type ScanBundleOptions = {
  bundleRoot?: string;
  deviceLabel?: string;
};

/**
 * Read-only scan of ProPresenter Libraries + Playlists under bundle root.
 * Does not contact ProPresenter API or modify any files.
 */
export async function scanBundle(options: ScanBundleOptions = {}): Promise<BundleScanResult> {
  const bundleRoot = options.bundleRoot ?? resolveBundleRoot();
  const warnings: string[] = [];
  const skipped = { count: 0 };
  const files: BundleFileRecord[] = [];

  try {
    await fs.access(bundleRoot);
  } catch {
    throw new Error(
      `PP_BUNDLE_ROOT not found: ${bundleRoot}. Set PP_BUNDLE_ROOT in .env.local or install ProPresenter.`,
    );
  }

  for (const root of WALK_ROOTS) {
    const abs = path.join(bundleRoot, root);
    try {
      await fs.access(abs);
      await walkDir(abs, root, 0, files, warnings, skipped);
    } catch {
      warnings.push(`Missing scan root: ${root}/`);
    }
  }

  const snapshot: BundleSnapshot = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    bundleRoot,
    deviceLabel: options.deviceLabel ?? "unknown",
    files,
  };

  return {
    snapshot,
    warnings,
    skippedPaths: skipped.count,
  };
}
