import { NextResponse } from "next/server";
import { guardProPresenterOnHosted } from "@/lib/propresenter/hosted-guard";
import { exportPlaylistNative, nativeExportFileName } from "@/lib/propresenter/playlist-native-export";
import { resolvePlaylistNameForPlan } from "@/lib/slide-deck/resolve-playlist-name";

/** POST — export .proplaylist from local ProPresenter for complete handoff upload. */
export async function POST(req: Request) {
  const hostedBlock = guardProPresenterOnHosted();
  if (hostedBlock) return hostedBlock;

  try {
    const body = (await req.json()) as {
      planId?: string;
      serviceTypeId?: string;
      playlistId?: string;
      playlistName?: string;
      nativeExportPath?: string;
    };

    const planId = body.planId?.trim() ?? "";
    if (!planId && !body.playlistName?.trim()) {
      return NextResponse.json(
        { ok: false, error: "planId or playlistName is required." },
        { status: 400 },
      );
    }

    const playlistName =
      body.playlistName?.trim() ||
      (planId
        ? await resolvePlaylistNameForPlan({
            planId,
            serviceTypeId: body.serviceTypeId?.trim() || undefined,
          })
        : "");

    const exported = await exportPlaylistNative({
      playlistName,
      nativeExportPath: body.nativeExportPath?.trim(),
    });

    return NextResponse.json({
      ok: true,
      fileName: exported.fileName || nativeExportFileName(playlistName),
      proplaylistBase64: exported.bytes.toString("base64"),
      sourcePath: exported.sourcePath,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
