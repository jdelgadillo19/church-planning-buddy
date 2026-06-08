import { NextResponse } from "next/server";
import type { BundleSnapshot } from "@/lib/propresenter/bundle-sync/types";
import { isMachineBearerAuthorized } from "@/lib/auth/machine-bearer";
import { upsertBootstrapRig } from "@/lib/pp-platform/rigs";
import { insertIndexSnapshot } from "@/lib/pp-platform/snapshots";
import { resolveUserOrg } from "@/lib/pp-platform/org-context";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";

/**
 * POST — register/update rig and upload index snapshot.
 * Auth: bootstrap bearer token (Phase 0) OR signed-in org admin.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      orgId?: string;
      displayName?: string;
      deviceFingerprint?: string;
      publicKey?: string;
      snapshot?: BundleSnapshot;
      deltaFromSnapshotId?: string;
    };

    if (!body.snapshot?.schemaVersion || !Array.isArray(body.snapshot.files)) {
      return NextResponse.json({ ok: false, error: "snapshot is required." }, { status: 400 });
    }

    const displayName = body.displayName?.trim() || "Presentation rig";
    let orgId = body.orgId?.trim();
    let pairedBy: string | undefined;

    if (isMachineBearerAuthorized(req)) {
      if (!orgId) {
        return NextResponse.json(
          { ok: false, error: "orgId required for bootstrap upload." },
          { status: 400 },
        );
      }
    } else if (isGrapevineAuthEnabled()) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
      }
      const org = await resolveUserOrg(supabase, user.id, orgId);
      if (!org || org.role !== "admin") {
        return NextResponse.json({ ok: false, error: "Org admin required." }, { status: 403 });
      }
      orgId = org.orgId;
      pairedBy = user.id;
    } else {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }

    const rig = await upsertBootstrapRig({
      orgId: orgId!,
      displayName,
      deviceFingerprint: body.deviceFingerprint,
      publicKey: body.publicKey ?? "bootstrap",
      pairedBy,
    });

    const snapshotRow = await insertIndexSnapshot({
      orgId: orgId!,
      rigId: rig.id,
      snapshot: body.snapshot,
      deltaFromSnapshotId: body.deltaFromSnapshotId,
    });

    return NextResponse.json({
      ok: true,
      rig: { id: rig.id, displayName: rig.display_name },
      snapshot: {
        id: snapshotRow.id,
        snapshotAt: snapshotRow.snapshot_at,
        fileCount: snapshotRow.file_count,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bootstrap upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
