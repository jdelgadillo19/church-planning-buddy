import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { validateNativePlaylistExport } from "./playlist-export-format";
import {
  loadProPresenterExportStagingDir,
  resolveExportAppleScriptPath,
} from "./rig-export-paths";

const execFileAsync = promisify(execFile);

export type NativePlaylistExport = {
  bytes: Buffer;
  fileName: string;
  sourcePath: string;
};

function sanitizeFileBase(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "playlist";
}

export { loadProPresenterExportStagingDir } from "./rig-export-paths";

export function nativeExportFileName(playlistName: string): string {
  return `${sanitizeFileBase(playlistName)}.proplaylist`;
}

async function ensureStagingDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not create ProPresenter export folder (${dir}): ${detail}`);
  }
}

async function clearStagingProplaylistFiles(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".proplaylist"))
      .map((e) => rm(path.join(dir, e.name), { force: true })),
  );
}

async function runExportAppleScript(
  playlistName: string,
  outputPosixPath: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const scriptPath = resolveExportAppleScriptPath(env);
  try {
    await access(scriptPath);
  } catch {
    throw new Error(
      `ProPresenter export script not found (${scriptPath}). Reinstall Grapevine Rig or set PP_EXPORT_APPLESCRIPT_PATH.`,
    );
  }
  const { stderr } = await execFileAsync("osascript", [scriptPath, playlistName, outputPosixPath], {
    timeout: 90_000,
  });
  if (stderr?.trim()) {
    throw new Error(stderr.trim());
  }
}

async function waitForExportFile(
  candidates: string[],
  timeoutMs: number,
  pollMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const filePath of candidates) {
      try {
        const st = await stat(filePath);
        if (st.isFile() && st.size > 100) return filePath;
      } catch {
        /* keep polling */
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    "Timed out waiting for ProPresenter playlist export. " +
      "Export manually (File → Export → Playlist), then publish with the file path or retry.",
  );
}

async function findRecentProplaylistInDir(dir: string, sinceMs: number): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  let best: { path: string; mtime: number } | null = null;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".proplaylist")) continue;
    const full = path.join(dir, entry.name);
    const st = await stat(full);
    if (st.mtimeMs < sinceMs) continue;
    if (!best || st.mtimeMs > best.mtime) {
      best = { path: full, mtime: st.mtimeMs };
    }
  }
  return best?.path ?? null;
}

export async function readNativePlaylistExportFromPath(
  filePath: string,
  playlistName: string,
): Promise<NativePlaylistExport> {
  const abs = path.resolve(filePath);
  const bytes = await readFile(abs);
  validateNativePlaylistExport(bytes, playlistName);
  return {
    bytes,
    fileName: path.basename(abs),
    sourcePath: abs,
  };
}

export type ExportPlaylistNativeInput = {
  playlistName: string;
  /** Skip AppleScript when operator already exported (File → Export → Playlist). */
  nativeExportPath?: string;
  env?: NodeJS.ProcessEnv;
  exportTimeoutMs?: number;
};

/**
 * Obtain a portable .proplaylist via ProPresenter File → Export → Playlist (macOS).
 */
export async function exportPlaylistNative(
  input: ExportPlaylistNativeInput,
): Promise<NativePlaylistExport> {
  const playlistName = input.playlistName.trim();
  if (!playlistName) throw new Error("playlistName is required for native export.");

  if (input.nativeExportPath?.trim()) {
    return readNativePlaylistExportFromPath(input.nativeExportPath.trim(), playlistName);
  }

  if (process.platform !== "darwin") {
    throw new Error(
      "Native ProPresenter playlist export requires macOS. " +
        "Pass nativeExportPath with a .proplaylist from File → Export → Playlist.",
    );
  }

  const env = input.env ?? process.env;
  const stagingDir = loadProPresenterExportStagingDir(env);
  await ensureStagingDir(stagingDir);
  await clearStagingProplaylistFiles(stagingDir);

  const outputPath = path.join(stagingDir, nativeExportFileName(playlistName));
  const startedAt = Date.now();
  const timeoutMs = input.exportTimeoutMs ?? 120_000;
  const pollMs = 500;

  try {
    await runExportAppleScript(playlistName, outputPath, env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/export script not found/i.test(msg)) throw e;
    throw new Error(
      `ProPresenter export automation failed: ${msg}. ` +
        "Keep ProPresenter open and frontmost, or export manually and pass nativeExportPath.",
    );
  }

  const recent = await findRecentProplaylistInDir(stagingDir, startedAt - 2000);
  const candidates = [outputPath, recent].filter((p): p is string => Boolean(p));

  const picked = await waitForExportFile(candidates, timeoutMs, pollMs);
  const bytes = await readFile(picked);
  validateNativePlaylistExport(bytes, playlistName);

  return {
    bytes,
    fileName: path.basename(picked),
    sourcePath: picked,
  };
}
