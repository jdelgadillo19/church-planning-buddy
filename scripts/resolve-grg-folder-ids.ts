/**
 * Resolve GRG Template/Output folder IDs on Drive (uses .env.local + .data/google-tokens.json).
 * Usage: npx tsx scripts/resolve-grg-folder-ids.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getAuthedClients, getOAuthClient } from "../src/lib/google/auth";
import type { GoogleTokens } from "../src/app/api/auth/google/_session";
import {
  resolveGrgOutputFolderPath,
  resolveGrgTemplateFolderPath,
} from "../src/lib/config/grg-drive";
import { resolveGrgTemplateRef } from "../src/lib/config/grg";
import {
  findDocByTitleInFolder,
  resolveFolderByPath,
} from "../src/lib/google/grg-drive-folders";

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
      /* try next session */
    }
  }
  throw new Error("No valid Google session — reconnect Google in the app.");
}

async function main() {
  loadEnvLocal();
  const templatePath = resolveGrgTemplateFolderPath();
  const outputPath = resolveGrgOutputFolderPath();
  const { drive } = getAuthedClients(await loadTokens());

  const templateFolderId = await resolveFolderByPath(drive, templatePath);
  const outputFolderId = await resolveFolderByPath(drive, outputPath);

  const templateRef = resolveGrgTemplateRef();
  const templateDoc = templateFolderId
    ? await findDocByTitleInFolder(drive, templateFolderId, templateRef.title)
    : null;

  const result = {
    templatePath,
    outputPath,
    templateFolderId,
    outputFolderId,
    templateDocId: templateDoc?.id ?? null,
    templateDocName: templateDoc?.name ?? null,
  };

  console.log(JSON.stringify(result, null, 2));
  console.log("\n# Paste into .env.local:\n");
  if (templateFolderId) console.log(`GRG_TEMPLATE_FOLDER_ID=${templateFolderId}`);
  if (outputFolderId) console.log(`GRG_OUTPUT_FOLDER_ID=${outputFolderId}`);
  if (templateDoc?.id) console.log(`GRG_TEMPLATE_ID=${templateDoc.id}`);

  if (!templateFolderId || !outputFolderId) {
    process.exitCode = 1;
    if (!templateFolderId) console.error(`Template folder not found: ${templatePath.join("/")}`);
    if (!outputFolderId) console.error(`Output folder not found: ${outputPath.join("/")}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
