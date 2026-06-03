import { NextResponse } from "next/server";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { PlaylistConflictError } from "@/lib/propresenter/playlist-write";
import { applyCommitPlan } from "@/lib/slide-deck/apply-commit";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { prepareSlideDeckApply } from "@/lib/slide-deck/prepare-apply";
import { resolveApplyContextFromClientPlan } from "@/lib/slide-deck/resolve-apply-context";
import { ProPresenterApiError } from "@/lib/propresenter/client";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      planId?: string;
      serviceTypeId?: string;
      confirm?: boolean;
      resolution?: "overwrite";
      librarySelections?: Record<string, string>;
      commitPlan?: MockCommitPlan;
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

    const planId = body.planId?.trim() ?? "";
    const clientPlan = body.commitPlan;

    let commitPlan: MockCommitPlan;
    let templateItems: Awaited<ReturnType<typeof resolveApplyContextFromClientPlan>>["templateItems"];
    let libraryIndex: Awaited<ReturnType<typeof resolveApplyContextFromClientPlan>>["libraryIndex"];

    if (clientPlan?.playlistName && clientPlan.playlistPreview?.length) {
      const ctx = await resolveApplyContextFromClientPlan(clientPlan);
      commitPlan = ctx.commitPlan;
      templateItems = ctx.templateItems;
      libraryIndex = ctx.libraryIndex;
    } else {
      if (!planId) {
        return NextResponse.json(
          { ok: false, error: "planId or commitPlan is required." },
          { status: 400 },
        );
      }
      const ctx = await prepareSlideDeckApply({
        planId,
        serviceTypeId: body.serviceTypeId?.trim() || undefined,
      });
      commitPlan = ctx.commitPlan;
      templateItems = ctx.templateItems;
      libraryIndex = ctx.libraryIndex;
    }

    const result = await applyCommitPlan({
      commitPlan,
      templateItems,
      libraryIndex,
      playlistResolution: body.resolution === "overwrite" ? "overwrite" : "reuse_empty",
      librarySelections: body.librarySelections,
    });

    return NextResponse.json({ ok: true, commitPlan, result });
  } catch (e) {
    if (e instanceof PlaylistConflictError) {
      return NextResponse.json(
        {
          ok: false,
          conflict: true,
          error: e.message,
          playlistId: e.playlistId,
          playlistName: e.playlistName,
          itemCount: e.itemCount,
        },
        { status: 409 },
      );
    }
    if (e instanceof ProPresenterApiError) {
      return NextResponse.json({ ok: false, error: e.message, detail: e.body }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Failed to apply slide deck to ProPresenter.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
