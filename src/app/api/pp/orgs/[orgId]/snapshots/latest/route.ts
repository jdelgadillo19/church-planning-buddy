import { NextResponse } from "next/server";
import {
  indexMetaFromRow,
  libraryIndexFromSnapshot,
  templateItemsFromSnapshot,
  resolveTemplateFromSnapshot,
} from "@/lib/pp-platform/cloud-index";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import { getRigById } from "@/lib/pp-platform/rigs";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

type RouteContext = { params: Promise<{ orgId: string }> };

/** GET — latest org index for mock-commit and preview. */
export async function GET(_req: Request, context: RouteContext) {
  try {
    if (!isGrapevineAuthEnabled()) {
      return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 401 });
    }

    const { orgId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const org = await resolveUserOrg(supabase, user.id, orgId);
    if (!org || org.orgId !== orgId) {
      return NextResponse.json({ ok: false, error: "Org access denied." }, { status: 403 });
    }

    const snapshot = await getLatestSnapshotForOrg(orgId);
    if (!snapshot) {
      return NextResponse.json({
        ok: true,
        snapshot: null,
        meta: null,
      });
    }

    const rig = await getRigById(snapshot.rig_id);
    const meta = indexMetaFromRow(
      {
        id: snapshot.id,
        snapshot_at: snapshot.snapshot_at,
        file_count: snapshot.file_count,
        index_json: snapshot.index_json,
        rig_id: snapshot.rig_id,
      },
      rig?.display_name ?? "Presentation rig",
    );

    const indexJson = snapshot.index_json;
    const template = resolveTemplateFromSnapshot(indexJson);

    return NextResponse.json({
      ok: true,
      meta,
      libraryIndex: libraryIndexFromSnapshot(indexJson),
      templateItems: templateItemsFromSnapshot(indexJson),
      template,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load snapshot.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
