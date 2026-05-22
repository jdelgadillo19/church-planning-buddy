import { NextResponse } from "next/server";
import { getAuthedClients } from "@/lib/google/auth";
import { exportDocPlainText } from "@/lib/google/drive-files";
import { buildSongListLines } from "@/lib/docs/grg-mutate";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import type { MvpApplyPayload } from "@/lib/mvp/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MvpApplyPayload;
    const grgDocTitle =
      body.grgDocTitle?.trim() ||
      process.env.GRG_OUTPUT_TITLE?.trim() ||
      process.env.GRG_DOC_TITLE?.trim() ||
      "";

    const songListLines = buildSongListLines(body.songList ?? []);
    const sections: Array<{
      title: string;
      bodyPreview: string;
      skipped: boolean;
      status: "skipped" | "no-selection" | "ready" | "error";
    }> = [];

    const tokens = await loadTokensForCurrentSession();
    const drive = tokens && googleConnected(tokens) ? getAuthedClients(tokens).drive : null;

    for (const song of body.songs ?? []) {
      if (song.skipped) {
        sections.push({ title: song.title, bodyPreview: "", skipped: true, status: "skipped" });
        continue;
      }

      if (!song.selectedFileId) {
        sections.push({
          title: song.title,
          bodyPreview: "No scan file selected for this song (will not be written on apply).",
          skipped: false,
          status: "no-selection",
        });
        continue;
      }

      if (!drive) {
        sections.push({
          title: song.title,
          bodyPreview: "(connect Google to preview)",
          skipped: false,
          status: "no-selection",
        });
        continue;
      }

      try {
        const text = await exportDocPlainText(drive, song.selectedFileId);
        sections.push({
          title: song.title,
          bodyPreview: text.slice(0, 1200) + (text.length > 1200 ? "\n…" : ""),
          skipped: false,
          status: "ready",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load scan";
        sections.push({
          title: song.title,
          bodyPreview: `Error: ${msg}`,
          skipped: false,
          status: "error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      preview: {
        grgDocTitle,
        dateFormatted: body.dateFormatted,
        songListLines,
        skipIntro: Boolean(body.skipIntro),
        sections,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
