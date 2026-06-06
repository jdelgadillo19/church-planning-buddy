import { NextResponse } from "next/server";
import { guardProPresenterOnHosted } from "@/lib/propresenter/hosted-guard";
import { getExistingPlaylistSummary } from "@/lib/propresenter/playlist-write";
import { ProPresenterApiError } from "@/lib/propresenter/client";
import { resolvePlaylistNameForPlan } from "@/lib/slide-deck/resolve-playlist-name";

export async function GET(req: Request) {
  const hostedBlock = guardProPresenterOnHosted();
  if (hostedBlock) return hostedBlock;

  try {
    const url = new URL(req.url);
    const planId = url.searchParams.get("planId")?.trim() ?? "";
    const serviceTypeId = url.searchParams.get("serviceTypeId")?.trim() || undefined;
    const playlistNameParam = url.searchParams.get("playlistName")?.trim();

    if (!planId && !playlistNameParam) {
      return NextResponse.json(
        { ok: false, error: "planId or playlistName is required." },
        { status: 400 },
      );
    }

    const playlistName =
      playlistNameParam ||
      (planId ? await resolvePlaylistNameForPlan({ planId, serviceTypeId }) : "");

    const summary = await getExistingPlaylistSummary(playlistName);

    const conflict =
      summary.exists && !summary.empty && summary.id && summary.name
        ? {
            playlistId: summary.id,
            playlistName: summary.name,
            itemCount: summary.itemCount,
            items: summary.items.map((item, index) => ({
              position: index + 1,
              name: item.name,
            })),
          }
        : null;

    return NextResponse.json({
      ok: true,
      playlistName,
      conflict,
      canOverwrite: Boolean(conflict),
    });
  } catch (e) {
    if (e instanceof ProPresenterApiError) {
      return NextResponse.json({ ok: false, error: e.message, detail: e.body }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Preflight failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
