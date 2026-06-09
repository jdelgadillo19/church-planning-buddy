import os from "node:os";
import path from "node:path";

/**
 * Staging folder for ProPresenter .proplaylist exports.
 * GUI rig workers have cwd `/` — never use `process.cwd()/.data` there.
 */
export function loadProPresenterExportStagingDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.PP_EXPORT_STAGING_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  if (env.RIG_ID?.trim()) {
    return path.join(os.tmpdir(), "grapevine-rig", "pp-exports");
  }

  return path.resolve(process.cwd(), ".data/pp-exports");
}

/** AppleScript used for File → Export → Playlist automation (macOS). */
export function resolveExportAppleScriptPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.PP_EXPORT_APPLESCRIPT_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  return path.resolve(process.cwd(), "scripts/propresenter/export-playlist.applescript");
}
