import { NextResponse } from "next/server";
import { ProPresenterApiError } from "@/lib/propresenter/client";
import { readLivePlaylistByName } from "@/lib/slide-deck/resolve-live-playlist";
import { resolvePlaylistNameForPlan } from "@/lib/slide-deck/resolve-playlist-name";

export async function GET(req: Request) {
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

    const live = await readLivePlaylistByName(playlistName);

    return NextResponse.json({
      ok: true,
      playlistName,
      nativeExportRequired: true,
      nativeExportHint:
        process.platform === "darwin"
          ? "Publish runs ProPresenter File → Export → Playlist on this Mac (or pass nativeExportPath)."
          : "On non-macOS, export manually and pass nativeExportPath when publishing.",
      livePlaylist: live
        ? {
            exists: true,
            playlistId: live.playlistId,
            itemCount: live.itemCount,
            items: live.items,
          }
        : { exists: false, itemCount: 0, items: [] },
    });
  } catch (e) {
    if (e instanceof ProPresenterApiError) {
      return NextResponse.json({ ok: false, error: e.message, detail: e.body }, { status: 502 });
    }
    const message = e instanceof Error ? e.message : "Publish preflight failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
