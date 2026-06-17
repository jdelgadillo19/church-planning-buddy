/**
 * Verify M0 Drive folder IDs are readable (smoke for re-point).
 *
 * Usage: npx tsx scripts/verify-m0-drive-ids.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getAuthedClients, getOAuthClient } from "../src/lib/google/auth";
import type { GoogleTokens } from "../src/app/api/auth/google/_session";
import type { drive_v3 } from "../src/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "../src/lib/google/drive-files";
import { findGrgTemplateDoc } from "../src/lib/google/grg-drive-folders";
import { resolveGrgDriveFolderRefs } from "../src/lib/config/grg-drive";
import { resolvePpDriveFolderRefs } from "../src/lib/config/pp-drive";
import { resolveGrgTemplateRef } from "../src/lib/config/grg";

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

async function assertFolder(drive: drive_v3.Drive, id: string, label: string) {
  const res = await drive.files.get({
    fileId: id,
    fields: "id,name,mimeType,driveId",
    supportsAllDrives: true,
  });
  const f = res.data;
  if (f.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error(`${label}: ${id} is not a folder (${f.mimeType})`);
  }
  console.log(`OK  ${label}: "${f.name}" (${id})`);
}

async function main() {
  loadEnvLocal();
  const grg = resolveGrgDriveFolderRefs();
  const pp = resolvePpDriveFolderRefs();
  const rootId = process.env.GV_DRIVE_LAYOUT_ROOT_FOLDER_ID?.trim();

  const tokens = await loadTokens();
  const { drive } = getAuthedClients(tokens);

  if (rootId) await assertFolder(drive, rootId, "GV_DRIVE_LAYOUT_ROOT");
  if (grg.templateFolderId) await assertFolder(drive, grg.templateFolderId, "GRG_TEMPLATE_FOLDER");
  if (grg.outputFolderId) await assertFolder(drive, grg.outputFolderId, "GRG_OUTPUT_FOLDER");

  const templateDoc = await findGrgTemplateDoc(tokens, drive, resolveGrgTemplateRef());
  console.log(`OK  GRG_TEMPLATE: "${templateDoc.name}" (${templateDoc.id})`);

  if (pp.playlistsFolderId) await assertFolder(drive, pp.playlistsFolderId, "PP_PLAYLISTS_FOLDER");
  if (pp.newFilesFolderId) await assertFolder(drive, pp.newFilesFolderId, "PP_NEW_FILES_FOLDER");

  const servicesId = process.env.PP_SERVICES_FOLDER_ID?.trim();
  if (servicesId) await assertFolder(drive, servicesId, "PP_SERVICES_FOLDER");

  const filebaseId = process.env.PP_FILEBASE_FOLDER_ID?.trim();
  if (filebaseId) await assertFolder(drive, filebaseId, "PP_FILEBASE_FOLDER");

  console.log("\nAll M0 Drive IDs verified.");
}

main().catch((err) => {
  console.error("VERIFY FAILED:", err);
  process.exit(1);
});
