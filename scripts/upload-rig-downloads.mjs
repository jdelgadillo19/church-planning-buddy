#!/usr/bin/env node
/**
 * Upload Grapevine Rig installers to R2 at fixed keys (permanent download URLs).
 *
 * Usage:
 *   npm run rig:upload-downloads -- --mac path/to.dmg --win path/to.exe --version 0.2.7
 *   npm run rig:upload-downloads -- --mac path/to.dmg --version 0.2.7
 *   npm run rig:upload-downloads -- --win path/to.exe --version 0.2.7
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "grapevine-rig-downloads";
const R2_KEYS = {
  mac: "grapevine-rig-macos.dmg",
  win: "grapevine-rig-windows-setup.exe",
};
const CONTENT_TYPES = {
  mac: "application/x-apple-diskimage",
  win: "application/octet-stream",
};

function parseArgs(argv) {
  const out = { mac: null, win: null, version: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mac" && argv[i + 1]) out.mac = argv[++i];
    else if (arg === "--win" && argv[i + 1]) out.win = argv[++i];
    else if (arg === "--version" && argv[i + 1]) out.version = argv[++i];
  }
  return out;
}

function putObject({ platform, filePath, version }) {
  const key = R2_KEYS[platform];
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const args = [
    "wrangler",
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--file",
    resolved,
    "--content-type",
    CONTENT_TYPES[platform],
  ];
  if (version) {
    args.push("--custom-metadata", `version=${version}`);
  }

  console.log(`Uploading ${resolved} → r2://${BUCKET}/${key}`);
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    cwd: path.dirname(fileURLToPath(import.meta.url)),
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const { mac, win, version } = parseArgs(process.argv.slice(2));
if (!mac && !win) {
  console.error(
    "Provide at least one of --mac <path> or --win <path> (optional --version x.y.z).",
  );
  process.exit(1);
}

if (mac) putObject({ platform: "mac", filePath: mac, version });
if (win) putObject({ platform: "win", filePath: win, version });

console.log("Done. Permanent URLs:");
console.log("  https://grapevineprep.com/downloads/grapevine-rig-macos.dmg");
console.log("  https://grapevineprep.com/downloads/grapevine-rig-windows-setup.exe");
