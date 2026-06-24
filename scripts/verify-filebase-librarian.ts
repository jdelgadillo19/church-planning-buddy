/**
 * Verify Filebase on Drive using production librarian tokens (Supabase oauth_tokens).
 * Run: npm run filebase:verify-librarian
 */
import { loadEnvLocal } from "./_load-env-local";
import { getAuthedClients } from "../src/lib/google/auth";
import { loadGoogleTokensForUser } from "../src/lib/google/token-store";
import { googleConnected } from "../src/app/api/auth/google/_session";
import { resolveFilebaseRootFolderId } from "../src/lib/google/filebase-drive-folders";
import { loadFilebaseDriveFileIndex } from "../src/lib/google/filebase-drive-index";

loadEnvLocal();

async function main() {
  const librarianId = process.env.PP_LIBRARIAN_USER_ID?.trim();
  if (!librarianId) {
    console.error("!! Set PP_LIBRARIAN_USER_ID in .env.local");
    process.exit(1);
  }

  const tokens = await loadGoogleTokensForUser(librarianId);
  if (!googleConnected(tokens)) {
    console.error(
      "!! Librarian Google not connected — Owner must Connect Google on grapevineprep.com",
    );
    process.exit(1);
  }

  const { drive } = getAuthedClients(tokens!);
  const rootId = await resolveFilebaseRootFolderId(drive);
  if (!rootId) {
    console.error(
      "!! Filebase root not resolved — set GV_DRIVE_LAYOUT=dual, GV_DRIVE_LAYOUT_ROOT_FOLDER_ID, PP_FILEBASE_FOLDER_PATH=Filebase",
    );
    process.exit(1);
  }
  console.log(`OK Filebase root: ${rootId}`);

  const index = await loadFilebaseDriveFileIndex(drive, rootId);
  if (!index || index.files.length === 0) {
    console.error("!! No files under Filebase/ on Drive (snapshot or Libraries/ walk).");
    process.exit(1);
  }

  console.log(`OK File index source=${index.source} files=${index.files.length}`);
  if (index.snapshotMetaPath) {
    console.log(`   snapshot: ${index.snapshotMetaPath}`);
  }
  const sample = index.files.slice(0, 3).map((f) => f.relativePath);
  console.log(`   sample paths: ${sample.join(", ")}`);
  console.log("\nLibrarian Filebase gate passed — Pull can resolve Drive file IDs.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
