import { NextResponse } from "next/server";
import { guardProPresenterOnHosted } from "@/lib/propresenter/hosted-guard";
import { resolvePlaylistNameForPlan } from "@/lib/slide-deck/resolve-playlist-name";
import { listPlaylists } from "@/lib/propresenter/playlists-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { readLivePlaylistByName } from "@/lib/slide-deck/resolve-live-playlist";

export async function POST(req: Request) {
  const hostedBlock = guardProPresenterOnHosted();
  if (hostedBlock) return hostedBlock;

  try {
    const body = (await req.json()) as {
      planId?: string;
      serviceTypeId?: string;
      playlistId?: string;
    };

    const planId = body.planId?.trim() ?? "";
    const serviceTypeId = body.serviceTypeId?.trim();

    if (!planId) {
      return NextResponse.json(
        { ok: false, error: "planId is required." },
        { status: 400 },
      );
    }

    const expectedPlaylistName = await resolvePlaylistNameForPlan({
      planId,
      serviceTypeId: serviceTypeId || undefined,
    });

    // Always return the playlist inventory when scanning by id or when the
    // expected playlist doesn't exist (needed for the UI fallback).
    const playlists = await listPlaylists();
    const expectedByName = await readLivePlaylistByName(expectedPlaylistName);

    if (body.playlistId?.trim()) {
      const playlistId = body.playlistId.trim();
      const found = playlists.find((p) => p.id === playlistId);
      if (!found) {
        return NextResponse.json(
          { ok: false, error: "Selected playlistId not found in ProPresenter." },
          { status: 404 },
        );
      }

      const items = await getPlaylistItems(playlistId);
      return NextResponse.json({
        ok: true,
        expectedPlaylistName,
        expectedByName,
        selected: {
          playlistId,
          playlistName: found.name,
          itemCount: items.length,
          items: items.map((it) => ({ position: it.index, name: it.name })),
        },
        playlists,
      });
    }

    return NextResponse.json({
      ok: true,
      expectedPlaylistName,
      expectedByName,
      selected: expectedByName,
      playlists,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Playlist scan failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

