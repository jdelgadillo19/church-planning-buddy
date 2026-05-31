import { NextResponse } from "next/server";
import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "@/lib/slide-deck/manifest";
import { buildMockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { applyCommitPlan } from "@/lib/slide-deck/apply-commit";
import { ppPing, ProPresenterApiError } from "@/lib/propresenter/client";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { loadSongLibraryIndex } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { findPlaylistByName } from "@/lib/propresenter/playlists-read";
import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      planId?: string;
      serviceTypeId?: string;
      confirm?: boolean;
    };

    if (body.confirm !== true) {
      return NextResponse.json(
        { ok: false, error: 'Live apply requires { "confirm": true } in the request body.' },
        { status: 400 },
      );
    }

    const config = loadProPresenterConfig();
    if (!config.allowWrites) {
      return NextResponse.json(
        {
          ok: false,
          error: "ProPresenter writes disabled. Set PP_ALLOW_WRITES=true in .env.local and restart dev server.",
        },
        { status: 403 },
      );
    }

    const plan = await loadPlanServiceOrder({
      planId: body.planId ?? "",
      serviceTypeId: body.serviceTypeId,
    });

    await ppPing(config);

    const templateName = resolveTemplatePlaylistName();
    const found = await findPlaylistByName(templateName);
    if (!found?.id) {
      return NextResponse.json(
        { ok: false, error: `Template playlist "${templateName}" not found in ProPresenter.` },
        { status: 400 },
      );
    }

    const templateItems = await getPlaylistItems(found.id);
    const libraryIndex = await loadSongLibraryIndex();

    const manifest = buildSlideDeckManifest({
      plan,
      templateSourceFound: true,
      templateSourcePlaylistId: found.id,
      templateSourcePlaylistPath: found.path ?? found.name,
      propresenterConnected: true,
      templateItems,
    });

    const commitPlan = buildMockCommitPlan({
      manifest,
      templateItems,
      libraryIndex,
      propresenterConnected: true,
    });

    const result = await applyCommitPlan({ commitPlan, templateItems, libraryIndex });

    return NextResponse.json({ ok: true, commitPlan, result });
  } catch (e) {
    if (e instanceof ProPresenterApiError) {
      return NextResponse.json({ ok: false, error: e.message, detail: e.body }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Failed to apply slide deck to ProPresenter.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
