import { NextResponse } from "next/server";
import { indexMetaFromRow } from "@/lib/pp-platform/cloud-index";
import { listRigsForOrg } from "@/lib/pp-platform/rigs";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import { canQueueBuilds, resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { getUserMemberships } from "@/lib/supabase/membership";

/** GET — org memberships, latest index meta, rigs for slide-deck UI. */
export async function GET(req: Request) {
  try {
    if (!isGrapevineAuthEnabled()) {
      return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 401 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const url = new URL(req.url);
    const preferredOrgId = url.searchParams.get("orgId")?.trim();
    const memberships = await getUserMemberships(supabase, user.id);
    const activeOrg = await resolveUserOrg(supabase, user.id, preferredOrgId ?? undefined);

    if (!activeOrg) {
      return NextResponse.json({
        ok: true,
        memberships: [],
        org: null,
        index: null,
        rigs: [],
        canQueueBuilds: false,
      });
    }

    const [snapshot, rigs] = await Promise.all([
      getLatestSnapshotForOrg(activeOrg.orgId),
      listRigsForOrg(activeOrg.orgId),
    ]);

    const rigNameById = new Map(rigs.map((r) => [r.id, r.display_name]));
    const index = snapshot
      ? indexMetaFromRow(
          {
            id: snapshot.id,
            snapshot_at: snapshot.snapshot_at,
            file_count: snapshot.file_count,
            index_json: snapshot.index_json,
            rig_id: snapshot.rig_id,
          },
          rigNameById.get(snapshot.rig_id) ?? "Presentation rig",
        )
      : null;

    return NextResponse.json({
      ok: true,
      memberships,
      org: activeOrg,
      index,
      rigs: rigs.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        lastSeenAt: r.last_seen_at,
      })),
      canQueueBuilds: canQueueBuilds(activeOrg.role),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load platform context.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
