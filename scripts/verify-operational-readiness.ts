/**
 * Pre-flight checks for Slide Deck Generator operational workflow.
 * Run from repo root: npm run operational:verify
 */
import { loadEnvLocal } from "./_load-env-local";
import { shouldPreferSharedDriveFilebase } from "../src/lib/google/filebase-drive-folders";

loadEnvLocal();

const checks: Array<{ label: string; ok: boolean; detail: string }> = [];

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

checks.push({
  label: "Supabase URL",
  ok: Boolean(env("NEXT_PUBLIC_SUPABASE_URL")),
  detail: env("NEXT_PUBLIC_SUPABASE_URL") ? "set" : "missing NEXT_PUBLIC_SUPABASE_URL",
});

checks.push({
  label: "Supabase anon key",
  ok: Boolean(env("NEXT_PUBLIC_SUPABASE_ANON_KEY")),
  detail: env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "set" : "missing NEXT_PUBLIC_SUPABASE_ANON_KEY",
});

checks.push({
  label: "PCO token",
  ok: Boolean(env("PCO_BASIC_TOKEN") || env("PCO_ACCESS_TOKEN")),
  detail: "PCO_BASIC_TOKEN or PCO_ACCESS_TOKEN required for plan load",
});

checks.push({
  label: "File librarian user",
  ok: Boolean(env("PP_LIBRARIAN_USER_ID")),
  detail: env("PP_LIBRARIAN_USER_ID")
    ? `PP_LIBRARIAN_USER_ID=${env("PP_LIBRARIAN_USER_ID")}`
    : "missing — Owner Connect Google + set PP_LIBRARIAN_USER_ID, then npm run env:cf",
});

const hasSharedFilebase =
  shouldPreferSharedDriveFilebase() &&
  Boolean(
    env("PP_FILEBASE_FOLDER_ID") ||
      env("PP_FILEBASE_FOLDER_PATH") ||
      env("GV_DRIVE_LAYOUT_ROOT_FOLDER_ID"),
  );
const hasLegacyComputer = Boolean(env("PP_COMPUTER_FILEBASE_FOLDER_ID"));

checks.push({
  label: "Filebase root (Shared Drive M2)",
  ok: hasSharedFilebase,
  detail: hasSharedFilebase
    ? `GV_DRIVE_LAYOUT=${env("GV_DRIVE_LAYOUT") ?? "legacy"} + Filebase path configured`
    : "set GV_DRIVE_LAYOUT_ROOT_FOLDER_ID and PP_FILEBASE_FOLDER_PATH=Filebase (unset PP_COMPUTER_FILEBASE_FOLDER_ID for pull)",
});

checks.push({
  label: "Legacy computer backup (deprecated for pull)",
  ok: !hasLegacyComputer || hasSharedFilebase,
  detail: hasLegacyComputer && !hasSharedFilebase
    ? "PP_COMPUTER_FILEBASE_FOLDER_ID alone — repoint to Shared Drive Filebase/ for M4 pull"
    : hasLegacyComputer
      ? "legacy id set but Shared Drive Filebase takes priority"
      : "not set (ok)",
});

checks.push({
  label: "Platform org",
  ok: Boolean(env("PP_PLATFORM_ORG_ID")),
  detail: env("PP_PLATFORM_ORG_ID") ? "set" : "missing PP_PLATFORM_ORG_ID",
});

checks.push({
  label: "Services folder (M3 publish)",
  ok: true,
  detail:
    env("PP_SERVICES_FOLDER_ID") || env("PP_SERVICES_FOLDER_PATH")
      ? "set"
      : "optional — set PP_SERVICES_FOLDER_ID for Services/ handoff publish",
});

const failed = checks.filter((c) => !c.ok);
console.log("Slide Deck operational readiness:\n");
for (const c of checks) {
  console.log(`  ${c.ok ? "OK" : "!!"} ${c.label}: ${c.detail}`);
}
console.log("");
console.log("After M2 seed on presentation rig, run: npm run filebase:verify-drive");
console.log("");
if (failed.length) {
  console.log(`${failed.length} check(s) need attention before production workflow.`);
  process.exit(1);
}
console.log("All required checks passed.");
