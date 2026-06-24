/**
 * Verify GDrive Filebase/snapshots/ has a seeded manifest (M2 gate for M4 pull).
 * Run: npm run filebase:verify-drive
 */
import { loadEnvLocal } from "./_load-env-local";
import { getAuthedClients, getOAuthClient } from "../src/lib/google/auth";
import type { GoogleTokens } from "../src/app/api/auth/google/_session";
import fs from "node:fs/promises";
import path from "node:path";
import { loadLatestFilebaseDriveSnapshot } from "../src/lib/google/filebase-drive-snapshot";
import { resolveFilebaseRootFolderId } from "../src/lib/google/filebase-drive-folders";

loadEnvLocal();

async function loadTokens(): Promise<GoogleTokens> {
  const tokenPath = path.join(process.cwd(), ".data/google-tokens.json");
  const raw = await fs.readFile(tokenPath, "utf8");
  const store = JSON.parse(raw) as Record<string, GoogleTokens>;
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
  const tokens = await loadTokens();
  const { drive } = getAuthedClients(tokens);

  const rootId = await resolveFilebaseRootFolderId(drive);
  if (!rootId) {
    console.error("!! Filebase root not resolved — set GV_DRIVE_LAYOUT_ROOT_FOLDER_ID + PP_FILEBASE_FOLDER_PATH=Filebase");
    process.exit(1);
  }
  console.log(`OK Filebase root folder id: ${rootId}`);

  const snapshot = await loadLatestFilebaseDriveSnapshot(drive);
  if (!snapshot) {
    console.error(
      "!! No Filebase snapshot on Drive. On presentation rig after M2 readiness gate:\n" +
        "   PP_BUNDLE_ROOT=\"<ProPresenter Support Files>\" npm run filebase:seed-upload",
    );
    process.exit(1);
  }

  console.log(`OK Latest snapshot: ${snapshot.driveMetaPath}`);
  console.log(`   snapshotId=${snapshot.snapshotId} createdAt=${snapshot.createdAt}`);
  console.log(`   indexed files=${snapshot.files.length}`);
  if (snapshot.files.length === 0) {
    console.error("!! Snapshot has zero files — re-run filebase:seed-upload");
    process.exit(1);
  }
  console.log("\nM2 Filebase gate passed — M4 pull can resolve Drive file IDs.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
