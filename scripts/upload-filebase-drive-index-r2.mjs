#!/usr/bin/env node
/**
 * Upload filebase/drive-index.json to R2 for fast Pull on Workers (avoids full Drive walk).
 * Run: npm run filebase:verify-librarian && npm run filebase:upload-index-r2
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cachePath = resolve(root, ".data/filebase-drive-index.json");

const payload = readFileSync(cachePath, "utf8");
const tmp = resolve(root, ".data/filebase-drive-index-upload.json");
writeFileSync(tmp, payload);

const put = spawnSync(
  "npx",
  [
    "wrangler",
    "r2",
    "object",
    "put",
    "grapevine-rig-downloads/filebase/drive-index.json",
    "--file",
    tmp,
    "--config",
    "wrangler.jsonc",
    "--content-type",
    "application/json",
    "--remote",
  ],
  { cwd: root, stdio: "inherit" },
);

unlinkSync(tmp);
process.exit(put.status ?? 1);
