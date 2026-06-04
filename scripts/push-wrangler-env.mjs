#!/usr/bin/env node
/**
 * Push .env.local to the grapevine-prep Worker (secrets + vars).
 * Run after deploy:cf or when env changes: npm run env:cf
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const config = "wrangler.jsonc";

const SECRET_KEY =
  /^(SUPABASE_SERVICE_ROLE_KEY|PCO_|GOOGLE_CLIENT_SECRET|WHATSAPP_|.*_TOKEN|.*_SECRET)$/i;

function parseEnvFile(path) {
  const out = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) out[key] = val;
  }
  return out;
}

const prodRedirect =
  process.env.GOOGLE_REDIRECT_URI?.trim() ||
  "https://grapevineprep.com/api/auth/google/callback";

let env;
try {
  env = parseEnvFile(envPath);
} catch {
  console.error("Missing .env.local — copy from .env.local.example first.");
  process.exit(1);
}

if (env.GOOGLE_CLIENT_ID) {
  env.GOOGLE_REDIRECT_URI = prodRedirect;
}

const secrets = {};
for (const [key, value] of Object.entries(env)) {
  if (SECRET_KEY.test(key)) secrets[key] = value;
}

const tmp = resolve(root, ".wrangler-secrets.json");
writeFileSync(tmp, JSON.stringify(secrets, null, 2));

const bulk = spawnSync(
  "npx",
  ["wrangler", "secret", "bulk", tmp, "--config", config],
  { cwd: root, stdio: "inherit" }
);
unlinkSync(tmp);

if (bulk.status !== 0) process.exit(bulk.status ?? 1);

if (!existsSync(resolve(root, ".open-next/worker.js"))) {
  console.error("No .open-next build — run npm run deploy:cf first.");
  process.exit(1);
}

const deployArgs = [
  "wrangler",
  "deploy",
  "--config",
  config,
  "--env-file",
  envPath,
  "--keep-vars",
];

const deploy = spawnSync("npx", deployArgs, { cwd: root, stdio: "inherit" });
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

console.log(
  `Synced ${Object.keys(secrets).length} secrets and redeployed with vars from .env.local (Google redirect → ${prodRedirect}).`
);
