/**
 * Resolve ProPresenter Playlists / New Files folder IDs on Drive.
 * Usage: npx tsx scripts/resolve-pp-folder-ids.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getAuthedClients, getOAuthClient } from "../src/lib/google/auth";
import type { GoogleTokens } from "../src/app/api/auth/google/_session";
import {
  resolvePpNewFilesFolderPath,
  resolvePpPlaylistsFolderPath,
} from "../src/lib/config/pp-drive";
import { resolveFolderByPath } from "../src/lib/google/grg-drive-folders";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function loadTokens(): Promise<GoogleTokens> {
  const tokenPath = path.join(process.cwd(), ".data/google-tokens.json");
  if (!fs.existsSync(tokenPath)) {
    throw new Error("No .data/google-tokens.json — connect Google in the app first.");
  }
  const store = JSON.parse(fs.readFileSync(tokenPath, "utf8")) as Record<string, GoogleTokens>;
  const candidates: GoogleTokens[] =
    store.access_token || store.refresh_token
      ? [store as GoogleTokens]
      : Object.values(store).filter((t) => t?.refresh_token || t?.access_token);

  const oauth = getOAuthClient();
  for (const tokens of candidates) {
    oauth.setCredentials(tokens);
    try {
      await oauth.getAccessToken();
      return tokens;
    } catch {
      /* try next */
    }
  }
  throw new Error("No valid Google session — reconnect Google in the app.");
}

async function main() {
  loadEnvLocal();
  const playlistsPath = resolvePpPlaylistsFolderPath();
  const newFilesPath = resolvePpNewFilesFolderPath();
  const { drive } = getAuthedClients(await loadTokens());

  const playlistsFolderId = await resolveFolderByPath(drive, playlistsPath);
  const newFilesFolderId = await resolveFolderByPath(drive, newFilesPath);

  console.log(
    JSON.stringify({ playlistsPath, newFilesPath, playlistsFolderId, newFilesFolderId }, null, 2),
  );
  console.log("\n# Paste into .env.local:\n");
  if (playlistsFolderId) console.log(`PP_PLAYLISTS_FOLDER_ID=${playlistsFolderId}`);
  if (newFilesFolderId) console.log(`PP_NEW_FILES_FOLDER_ID=${newFilesFolderId}`);

  if (!playlistsFolderId || !newFilesFolderId) {
    process.exitCode = 1;
    if (!playlistsFolderId) {
      console.error(`Playlists folder not found: ${playlistsPath.join("/")}`);
    }
    if (!newFilesFolderId) {
      console.error(`New Files folder not found: ${newFilesPath.join("/")}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
