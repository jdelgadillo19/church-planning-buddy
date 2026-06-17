/**
 * Seed Filebase/ on Shared Drive from a rig bundle scan (M2).
 *
 * Usage:
 *   PP_BUNDLE_ROOT="/path/to/ProPresenter/Support Files" npm run filebase:seed-upload
 *   npm run filebase:seed-upload -- --dry-run
 */
import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "./_load-env-local";
import { getAuthedClients, getOAuthClient } from "../src/lib/google/auth";
import type { GoogleTokens } from "../src/app/api/auth/google/_session";
import { scanBundle } from "../src/lib/propresenter/bundle-sync/scanner";
import { resolveFilebaseRootFolderId, resolveFilebaseSnapshotsFolderId } from "../src/lib/google/filebase-drive-folders";
import { ensureChildFolder } from "../src/lib/google/pp-drive-folders";
import { upsertFileInFolder, upsertJsonInFolder } from "../src/lib/google/drive-upload";
import { sha256Hex } from "../src/lib/zip/buffer-zip";

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

async function ensurePathFolders(
  drive: ReturnType<typeof getAuthedClients>["drive"],
  rootId: string,
  relativePath: string,
): Promise<string> {
  const parts = relativePath.split("/").filter(Boolean).slice(0, -1);
  let parent = rootId;
  for (const part of parts) {
    parent = await ensureChildFolder(drive, parent, part);
  }
  return parent;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const maxFilesArg = process.argv.find((a) => a.startsWith("--max="));
  const maxFiles = maxFilesArg ? Number.parseInt(maxFilesArg.split("=")[1] ?? "", 10) : 500;

  const tokens = await loadTokens();
  const { drive } = getAuthedClients(tokens);
  const filebaseRoot = await resolveFilebaseRootFolderId(drive);
  if (!filebaseRoot) {
    throw new Error("Set PP_FILEBASE_FOLDER_ID or GV_DRIVE_LAYOUT_ROOT_FOLDER_ID for Filebase/.");
  }

  const scan = await scanBundle();
  const files = scan.snapshot.files.slice(0, maxFiles);
  console.log(`Scan: ${files.length} file(s) to upload (max ${maxFiles}).`);

  const uploaded: Array<{
    relativePath: string;
    driveFileId: string;
    sha256: string;
    size: number;
  }> = [];

  if (!dryRun) {
    for (const file of files) {
      const abs = path.join(scan.snapshot.bundleRoot, file.relativePath);
      const body = await fs.readFile(abs);
      const parentId = await ensurePathFolders(drive, filebaseRoot, file.relativePath);
      const name = file.relativePath.split("/").pop()!;
      const result = await upsertFileInFolder(drive, parentId, name, body, "application/octet-stream");
      uploaded.push({
        relativePath: file.relativePath.replace(/\\/g, "/"),
        driveFileId: result.driveFileId,
        sha256: result.sha256,
        size: file.size,
      });
      if (uploaded.length % 25 === 0) {
        console.log(`  uploaded ${uploaded.length}/${files.length}…`);
      }
    }

    const snapshotsFolder = await resolveFilebaseSnapshotsFolderId(drive);
    if (!snapshotsFolder) throw new Error("Could not resolve Filebase/snapshots/");

    const snapshotId = `baseline-${Date.now()}`;
    const manifest = {
      schemaVersion: 1,
      snapshotId,
      createdAt: new Date().toISOString(),
      bundleRoot: scan.snapshot.bundleRoot,
      deviceLabel: scan.snapshot.deviceLabel,
      fileCount: uploaded.length,
      files: uploaded,
      libraryIndex: scan.snapshot.libraryIndex ?? [],
    };

    await upsertJsonInFolder(drive, snapshotsFolder, `${snapshotId}.json`, manifest);
    console.log(`\nWrote Filebase/snapshots/${snapshotId}.json (${uploaded.length} files).`);
  } else {
    console.log("Dry run — no uploads.");
    for (const file of files.slice(0, 5)) {
      const abs = path.join(scan.snapshot.bundleRoot, file.relativePath);
      const body = await fs.readFile(abs);
      console.log(`  would upload ${file.relativePath} sha256=${sha256Hex(body).slice(0, 12)}…`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
