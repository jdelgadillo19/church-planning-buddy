/**
 * Apply handoff rig policy migration via Supabase Management API or direct DB URL.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... npx tsx scripts/apply-handoff-rig-policy-migration.ts
 *   DATABASE_URL=postgresql://... npx tsx scripts/apply-handoff-rig-policy-migration.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
  "";

const SQL_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260617120000_handoff_rig_policy.sql",
);

async function applyViaDatabaseUrl(dbUrl: string, sql: string) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function applyViaManagementApi(token: string, sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${body}`);
  }
}

async function main() {
  if (!PROJECT_REF) throw new Error("Could not resolve Supabase project ref from env.");

  const sql = readFileSync(SQL_PATH, "utf8");
  const dbUrl = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

  if (dbUrl) {
    console.log("Applying via DATABASE_URL…");
    await applyViaDatabaseUrl(dbUrl, sql);
  } else if (token) {
    console.log(`Applying via Management API (${PROJECT_REF})…`);
    await applyViaManagementApi(token, sql);
  } else {
    throw new Error(
      "Set DATABASE_URL or SUPABASE_ACCESS_TOKEN.\n" +
        "  DATABASE_URL — Supabase → Project Settings → Database → connection string\n" +
        "  SUPABASE_ACCESS_TOKEN — https://supabase.com/dashboard/account/tokens",
    );
  }

  console.log("Migration SQL applied.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
