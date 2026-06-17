import { NextResponse } from "next/server";
import type { BundleSnapshot } from "@/lib/propresenter/bundle-sync/types";
import { authenticateRigOrBootstrap } from "@/lib/pp-platform/rig-auth";
import { insertIndexSnapshot } from "@/lib/pp-platform/snapshots";
import { isPresentationRigKind } from "@/lib/slide-deck/device-context";

type RouteContext = { params: Promise<{ rigId: string }> };

/** POST — rig uploads index snapshot. */
export async function POST(req: Request, context: RouteContext) {
  try {
    const { rigId } = await context.params;
    const rig = await authenticateRigOrBootstrap(req, rigId);
    if (!rig || rig.id !== rigId) {
      return NextResponse.json({ ok: false, error: "Rig not authorized." }, { status: 401 });
    }
    if (!isPresentationRigKind(rig.rig_kind)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Only the sanctuary presentation rig may upload the org library index. Do not pair Grapevine Rig on remote prep machines.",
        },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      snapshot?: BundleSnapshot;
      deltaFromSnapshotId?: string;
    };

    if (!body.snapshot?.schemaVersion || !Array.isArray(body.snapshot.files)) {
      return NextResponse.json({ ok: false, error: "snapshot is required." }, { status: 400 });
    }

    const row = await insertIndexSnapshot({
      orgId: rig.org_id,
      rigId: rig.id,
      snapshot: body.snapshot,
      deltaFromSnapshotId: body.deltaFromSnapshotId,
    });

    return NextResponse.json({
      ok: true,
      snapshot: {
        id: row.id,
        snapshotAt: row.snapshot_at,
        fileCount: row.file_count,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Snapshot upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
