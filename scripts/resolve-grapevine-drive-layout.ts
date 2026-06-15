/**
 * Resolve GRG + ProPresenter handoff folder IDs under a Grapevine layout root on Drive.
 *
 * Usage:
 *   npx tsx scripts/resolve-grapevine-drive-layout.ts
 *   npx tsx scripts/resolve-grapevine-drive-layout.ts --parent 1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw
 *   npx tsx scripts/resolve-grapevine-drive-layout.ts --list 1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw
 *
 * Requires .data/google-tokens.json (Connect Google in local dev) with write access to the layout root.
 */
import fs from "node:fs";
import path from "node:path";
import { getAuthedClients, getOAuthClient } from "../src/lib/google/auth";
import type { GoogleTokens } from "../src/app/api/auth/google/_session";
import type { drive_v3 } from "../src/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "../src/lib/google/drive-files";
import {
  findDocByTitleInFolder,
  listMatchingFolders,
} from "../src/lib/google/grg-drive-folders";
import { resolveGrgTemplateRef } from "../src/lib/config/grg";

const FOLDER_MIME = "application/vnd.google-apps.folder";

const PATH_CANDIDATES = {
  grgTemplate: [
    ["Get Ready Guide", "Template"],
    ["church-planning-buddy", "Get Ready Guide", "Template"],
  ],
  grgOutput: [
    ["Get Ready Guide", "Output"],
    ["church-planning-buddy", "Get Ready Guide", "Output"],
  ],
  ppPlaylists: [
    ["ProPresenter", "Playlists"],
    ["church-planning-buddy", "ProPresenter", "Playlists"],
    ["Slide Deck"],
  ],
  ppNewFiles: [
    ["ProPresenter", "New Files"],
    ["church-planning-buddy", "ProPresenter", "New Files"],
  ],
} as const;

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

async function resolveUnderParent(
  drive: drive_v3.Drive,
  parentId: string,
  segments: readonly string[],
): Promise<string | null> {
  let currentParent = parentId;
  for (const segment of segments) {
    const matches = await listMatchingFolders(drive, segment, currentParent);
    if (matches.length === 0) return null;
    const id = matches[0]?.id;
    if (!id) return null;
    currentParent = id;
  }
  return currentParent;
}

async function firstResolved(
  drive: drive_v3.Drive,
  parentId: string,
  candidates: readonly (readonly string[])[],
): Promise<{ id: string; path: string } | null> {
  for (const segments of candidates) {
    const id = await resolveUnderParent(drive, parentId, segments);
    if (id) return { id, path: segments.join("/") };
  }
  return null;
}

async function listChildren(drive: drive_v3.Drive, folderId: string, depth = 0, maxDepth = 2) {
  const q = `mimeType='${FOLDER_MIME}' and '${folderId}' in parents and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 100,
    orderBy: "name",
    corpora: "allDrives",
    ...SHARED_DRIVE_OPTS,
  });
  const folders = list.data.files ?? [];
  for (const f of folders) {
    const indent = "  ".repeat(depth);
    console.log(`${indent}${f.name}/  (${f.id})`);
    if (depth + 1 < maxDepth && f.id) {
      await listChildren(drive, f.id, depth + 1, maxDepth);
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let parent =
    process.env.GV_DRIVE_LAYOUT_ROOT_FOLDER_ID?.trim() ||
    "1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw";
  let listOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--parent" && args[i + 1]) {
      parent = args[++i]!;
    } else if (args[i] === "--list") {
      listOnly = true;
      if (args[i + 1] && !args[i + 1]!.startsWith("--")) parent = args[++i]!;
    }
  }

  return { parent, listOnly };
}

async function main() {
  loadEnvLocal();
  const { parent, listOnly } = parseArgs();
  const { drive } = getAuthedClients(await loadTokens());

  const meta = await drive.files.get({
    fileId: parent,
    fields: "id,name,driveId,capabilities",
    supportsAllDrives: true,
  });

  console.log(`Layout root: ${meta.data.name} (${parent})`);
  const canAdd = meta.data.capabilities?.canAddChildren;
  const canEdit = meta.data.capabilities?.canEdit;
  if (canAdd === false || canEdit === false) {
    console.warn(
      "\n⚠ Connected account may be read-only on this folder. GRG Apply and publish need Content manager or Editor.\n",
    );
  }

  if (listOnly) {
    console.log("\nFolders under layout root:\n");
    await listChildren(drive, parent);
    return;
  }

  const grgTemplate = await firstResolved(drive, parent, PATH_CANDIDATES.grgTemplate);
  const grgOutput = await firstResolved(drive, parent, PATH_CANDIDATES.grgOutput);
  const ppPlaylists = await firstResolved(drive, parent, PATH_CANDIDATES.ppPlaylists);
  const ppNewFiles = await firstResolved(drive, parent, PATH_CANDIDATES.ppNewFiles);

  const templateRef = resolveGrgTemplateRef();
  const templateDoc =
    grgTemplate?.id != null
      ? await findDocByTitleInFolder(drive, grgTemplate.id, templateRef.title)
      : null;

  const result = {
    layoutRootFolderId: parent,
    layoutRootName: meta.data.name,
    grgTemplate,
    grgOutput,
    ppPlaylists,
    ppNewFiles,
    templateDocId: templateDoc?.id ?? null,
    templateDocTitle: templateDoc?.name ?? null,
  };

  console.log(JSON.stringify(result, null, 2));
  console.log("\n# Paste into .env.local (and Cloudflare via npm run env:cf):\n");
  console.log(`GV_DRIVE_LAYOUT_ROOT_FOLDER_ID=${parent}`);
  if (grgTemplate) console.log(`GRG_TEMPLATE_FOLDER_ID=${grgTemplate.id}`);
  if (grgOutput) console.log(`GRG_OUTPUT_FOLDER_ID=${grgOutput.id}`);
  if (templateDoc?.id) console.log(`GRG_TEMPLATE_ID=${templateDoc.id}`);
  if (ppPlaylists) console.log(`PP_PLAYLISTS_FOLDER_ID=${ppPlaylists.id}`);
  if (ppNewFiles) console.log(`PP_NEW_FILES_FOLDER_ID=${ppNewFiles.id}`);

  if (!grgTemplate || !grgOutput) {
    console.error(
      "\nGRG folders not found under layout root. Run with --list to inspect structure:\n" +
        `  npx tsx scripts/resolve-grapevine-drive-layout.ts --list ${parent}`,
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
