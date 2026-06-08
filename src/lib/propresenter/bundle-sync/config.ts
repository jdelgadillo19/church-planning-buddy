import path from "node:path";
import os from "node:os";

const DEFAULT_MAC_BUNDLE = path.join(
  os.homedir(),
  "Library/Application Support/RenewedVision/ProPresenter",
);

/** Resolve ProPresenter Support Files root for bundle scanning. */
export function resolveBundleRoot(): string {
  const fromEnv = process.env.PP_BUNDLE_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return DEFAULT_MAC_BUNDLE;
}

export const BUNDLE_SCAN_EXCLUDE_DIRS = new Set([
  "configuration",
  "cache",
  "logs",
  ".git",
]);

export const BUNDLE_SCAN_EXCLUDE_GLOBS = [".ds_store", ".tmp", ".log"];
