import { NextResponse } from "next/server";
import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "@/lib/slide-deck/manifest";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";
import { isProPresenterUnavailableOnHosted } from "@/lib/propresenter/hosted";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      planId?: string;
      serviceTypeId?: string;
      checkTemplate?: boolean;
    };

    const plan = await loadPlanServiceOrder({
      planId: body.planId ?? "",
      serviceTypeId: body.serviceTypeId,
    });

    let propresenterConnected = false;
    let templateSourceFound: boolean | null = null;
    let templateSourcePlaylistId: string | undefined;
    let templateSourcePlaylistPath: string | undefined;

    const shouldCheckTemplate = body.checkTemplate !== false;

    if (shouldCheckTemplate && !isProPresenterUnavailableOnHosted()) {
      const config = loadProPresenterConfig();
      try {
        await ppPing(config);
        propresenterConnected = true;
        const templateName = resolveTemplatePlaylistName();
        const found = await findPlaylistByName(templateName);
        templateSourceFound = found !== null;
        if (found) {
          templateSourcePlaylistId = found.id;
          templateSourcePlaylistPath = found.path ?? found.name;
        }
      } catch (e) {
        propresenterConnected = false;
        templateSourceFound = null;
        if (e instanceof ProPresenterApiError && e.message) {
          /* expected when PP offline */
        }
      }
    }

    const manifest = buildSlideDeckManifest({
      plan,
      templateSourceFound,
      templateSourcePlaylistId,
      templateSourcePlaylistPath,
      propresenterConnected,
    });

    return NextResponse.json({ ok: true, manifest });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build slide deck manifest.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
