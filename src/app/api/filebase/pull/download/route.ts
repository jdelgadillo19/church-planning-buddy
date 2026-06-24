import { loadStagedFilebasePull } from "@/lib/google/filebase-pull-store";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

/** GET — download a staged filebase pull zip from R2. */
export async function GET(req: Request) {
  if (!isGrapevineAuthEnabled()) {
    return new Response("Auth not configured.", { status: 401 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Sign in required.", { status: 401 });
  }

  const url = new URL(req.url);
  const pullId = url.searchParams.get("id")?.trim() ?? "";
  const orgId = url.searchParams.get("orgId")?.trim() ?? "";
  if (!pullId || !orgId) {
    return new Response("id and orgId are required.", { status: 400 });
  }

  const org = await resolveUserOrg(supabase, user.id, orgId);
  if (!org) {
    return new Response("No organization membership.", { status: 403 });
  }

  const staged = await loadStagedFilebasePull({ orgId: org.orgId, pullId });
  if (!staged) {
    return new Response("Pull download expired or not found. Run Pull again.", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Content-Disposition", `attachment; filename="${staged.fileName}"`);
  headers.set("Cache-Control", "no-store, no-transform");
  if (staged.size != null) {
    headers.set("Content-Length", String(staged.size));
  }

  return new Response(staged.body, { status: 200, headers });
}
