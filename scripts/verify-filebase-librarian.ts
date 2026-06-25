/**
 * Verify Filebase on Drive using production librarian tokens (Supabase oauth_tokens).
 * Run: npm run filebase:verify-librarian
 */
import { loadEnvLocal } from "./_load-env-local";
import { getAuthedClients } from "../src/lib/google/auth";
import { loadGoogleTokensForUser } from "../src/lib/google/token-store";
import { googleConnected } from "../src/app/api/auth/google/_session";
import { resolveFilebasePullSource, hasFilebaseDriveConfig } from "../src/lib/google/filebase-drive-folders";

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

  if (!hasFilebaseDriveConfig()) {
    console.error(
      "!! Filebase not configured — set GV_DRIVE_LAYOUT_ROOT_FOLDER_ID + PP_FILEBASE_FOLDER_PATH or PP_COMPUTER_FILEBASE_FOLDER_ID",
    );
    process.exit(1);
  }

  const pullSource = await resolveFilebasePullSource(drive);
  if (!pullSource) {
    console.error(
      "!! No files under Shared Drive Filebase/ or Computer backup — run M2 seed or confirm Envy Drive sync.",
    );
    process.exit(1);
  }

  console.log(`OK Filebase pull source: ${pullSource.source} root=${pullSource.rootId}`);
  console.log(`OK File index source=${pullSource.index.source} files=${pullSource.index.files.length}`);
  if (pullSource.index.snapshotMetaPath) {
    console.log(`   snapshot: ${pullSource.index.snapshotMetaPath}`);
  }
  const sample = pullSource.index.files.slice(0, 3).map((f) => f.relativePath);
  console.log(`   sample paths: ${sample.join(", ")}`);
  console.log("\nLibrarian Filebase gate passed — Pull can resolve Drive file IDs.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
