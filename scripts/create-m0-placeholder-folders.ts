/**
 * M0 ops: create empty Filebase/, Filebase/snapshots/, Services/ under layout root.
 *
 * Usage: npx tsx scripts/create-m0-placeholder-folders.ts
 *
 * Requires .data/google-tokens.json with write access to GV_DRIVE_LAYOUT_ROOT_FOLDER_ID.
 */
import fs from "node:fs";
import path from "node:path";
import { getAuthedClients, getOAuthClient } from "../src/lib/google/auth";
import type { GoogleTokens } from "../src/app/api/auth/google/_session";
import { ensureChildFolder } from "../src/lib/google/pp-drive-folders";
import { driveFolderUrl } from "../src/lib/google/pp-drive-folders";

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
  throw new Error("No valid Google tokens in .data/google-tokens.json");
}

async function main() {
  loadEnvLocal();
  const rootId = process.env.GV_DRIVE_LAYOUT_ROOT_FOLDER_ID?.trim();
  if (!rootId) {
    throw new Error("Set GV_DRIVE_LAYOUT_ROOT_FOLDER_ID in .env.local");
  }

  const tokens = await loadTokens();
  const { drive } = getAuthedClients(tokens);

  const filebaseId = await ensureChildFolder(drive, rootId, "Filebase");
  const snapshotsId = await ensureChildFolder(drive, filebaseId, "snapshots");
  const servicesId = await ensureChildFolder(drive, rootId, "Services");

  console.log("Placeholder folders ready:");
  console.log(`  Filebase/          ${filebaseId}  ${driveFolderUrl(filebaseId)}`);
  console.log(`  Filebase/snapshots ${snapshotsId}  ${driveFolderUrl(snapshotsId)}`);
  console.log(`  Services/          ${servicesId}  ${driveFolderUrl(servicesId)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
