import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getAuthedClients } from "@/lib/google/auth";
import { getHandoffById } from "@/lib/pp-platform/submissions";
import { canQueueBuilds, resolveUserOrg } from "@/lib/pp-platform/org-context";
import { queueServicesHandoffPublish } from "@/lib/slide-deck/services-handoff";
import { createClient } from "@/lib/supabase/server";
import { isGrapevineAuthEnabled } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { nativeExportFileName } from "@/lib/propresenter/playlist-native-export";

type RouteContext = { params: Promise<{ id: string }> };

/** POST — publish a complete handoff package to Services/ (retry or manual). */
export async function POST(req: Request, context: RouteContext) {
  try {
    if (!isGrapevineAuthEnabled()) {
      return NextResponse.json({ ok: false, error: "Auth not configured." }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as {
      orgId?: string;
      proplaylistBase64?: string;
      proplaylistFileName?: string;
    };

    const org = await resolveUserOrg(supabase, user.id, body.orgId?.trim());
    if (!org) {
      return NextResponse.json({ ok: false, error: "No organization membership." }, { status: 403 });
    }
    if (!canQueueBuilds(org.role)) {
      return NextResponse.json({ ok: false, error: "Planner or admin role required." }, { status: 403 });
    }

    const handoff = await getHandoffById(id);
    if (!handoff || handoff.org_id !== org.orgId) {
      return NextResponse.json({ ok: false, error: "Handoff not found." }, { status: 404 });
    }
    if (handoff.handoff_status !== "complete") {
      return NextResponse.json(
        { ok: false, error: "Only complete handoffs can be published to Services/." },
        { status: 400 },
      );
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json(
        { ok: false, error: "Connect Google before publishing to Drive." },
        { status: 401 },
      );
    }
    if (!body.proplaylistBase64?.trim()) {
      return NextResponse.json(
        { ok: false, error: "proplaylistBase64 is required." },
        { status: 400 },
      );
    }

    const { drive } = getAuthedClients(tokens!);
    const servicesHandoff = await queueServicesHandoffPublish({
      handoff,
      drive,
      proplaylistBytes: Buffer.from(body.proplaylistBase64.trim(), "base64"),
      proplaylistFileName:
        body.proplaylistFileName?.trim() ||
        nativeExportFileName(handoff.commit_plan.playlistName),
      publishedBy: user.email ?? undefined,
    });

    if (servicesHandoff.driveFolderUrl) {
      const admin = createAdminClient();
      await admin
        .from("slide_deck_submissions")
        .update({
          services_package_id: servicesHandoff.packageId,
          services_drive_url: servicesHandoff.driveFolderUrl,
          rig_handoff_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", handoff.id);
    }

    return NextResponse.json({ ok: true, servicesHandoff });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Handoff publish failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
