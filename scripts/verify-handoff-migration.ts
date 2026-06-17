/**
 * Verify slide_deck handoff migration (20260616140000) is applied.
 *
 * Usage: npx tsx scripts/verify-handoff-migration.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./_load-env-local";

loadEnvLocal();

const HANDOFF_COLUMNS = [
  "handoff_status",
  "missing_elements",
  "missing_files",
  "parent_handoff_id",
  "presentation_instance_id",
  "services_package_id",
  "services_drive_url",
  "rig_handoff_status",
  "replace_on_rig",
  "admin_approved_for_rig",
  "version_label",
] as const;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const supabase = createClient(url, key);
  const select = HANDOFF_COLUMNS.join(", ");
  const { error } = await supabase.from("slide_deck_submissions").select(select).limit(1);

  if (error) {
    console.error("Handoff migration NOT applied:", error.message);
    console.error(
      "\nApply: supabase link --project-ref <ref> && supabase db push\n" +
        "Or run SQL: supabase/migrations/20260616140000_slide_deck_handoffs.sql",
    );
    process.exit(2);
  }

  console.log("OK — handoff columns present on slide_deck_submissions:");
  for (const col of HANDOFF_COLUMNS) console.log(`  - ${col}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
