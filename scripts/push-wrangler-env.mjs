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

function envToDeployFileContent(envObj) {
  return (
    Object.entries(envObj)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n"
  );
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

const secretsTmp = resolve(root, ".wrangler-secrets.json");
writeFileSync(secretsTmp, JSON.stringify(secrets, null, 2));

const bulk = spawnSync(
  "npx",
  ["wrangler", "secret", "bulk", secretsTmp, "--config", config],
  { cwd: root, stdio: "inherit" }
);
unlinkSync(secretsTmp);

if (bulk.status !== 0) process.exit(bulk.status ?? 1);

if (!existsSync(resolve(root, ".open-next/worker.js"))) {
  console.error("No .open-next build — run npm run deploy:cf first.");
  process.exit(1);
}

const deployEnvPath = resolve(root, ".wrangler-deploy.env");
writeFileSync(deployEnvPath, envToDeployFileContent(env));

const deployArgs = [
  "wrangler",
  "deploy",
  "--config",
  config,
  "--env-file",
  deployEnvPath,
  "--keep-vars",
];

const deploy = spawnSync("npx", deployArgs, { cwd: root, stdio: "inherit" });
unlinkSync(deployEnvPath);

if (deploy.status !== 0) {
  console.error(
    "Worker deploy failed (secrets were synced). Fix deploy errors, then re-run npm run env:cf."
  );
  console.error(
    `If Connect Google still redirects to localhost, set GOOGLE_REDIRECT_URI in Cloudflare Dashboard → Workers → grapevine-prep → Settings → Variables to ${prodRedirect}.`
  );
  process.exit(deploy.status ?? 1);
}

const deployedRedirect = env.GOOGLE_REDIRECT_URI ?? "(unchanged)";
console.log(
  `Synced ${Object.keys(secrets).length} secrets and redeployed Worker vars (GOOGLE_REDIRECT_URI → ${deployedRedirect}).`
);

if (!secrets.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "Warning: SUPABASE_SERVICE_ROLE_KEY not in .env.local — Google Drive tokens will not persist in Supabase oauth_tokens."
  );
}
