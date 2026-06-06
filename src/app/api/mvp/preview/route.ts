import { NextResponse } from "next/server";
import { buildRosterPreviewFromPco, ROSTER_NAME_POSITION_PLACEHOLDER } from "@/lib/docs/grg-roster";
import { extractPlainPreview, loadSourceGoogleDoc } from "@/lib/docs/scan-import";
import { buildSongListLines } from "@/lib/docs/grg-mutate";
import { exportDriveFilePlainTextForTokens } from "@/lib/google/drive-fetch";
import type { PlanRosterRow } from "@/lib/pco/plan-team";
import { resolveGrgSection } from "@/lib/pco/roster-team-scope";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import type { MvpApplyPayload } from "@/lib/mvp/types";

function rosterFromPayload(body: MvpApplyPayload): PlanRosterRow[] {
  return (body.roster ?? []).map((r, i) => ({
    teamMemberId: r.teamMemberId ?? `payload-${i}`,
    personId: r.teamMemberId ?? `payload-${i}`,
    displayName: r.displayName,
    pcoPositionName: r.pcoPositionName,
    positionName: r.positionName,
    teamName: r.teamName,
    grgSection: r.grgSection ?? resolveGrgSection(r.pcoPositionName, r.teamName),
    status: r.status,
  }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MvpApplyPayload;
    const grgDocTitle =
      body.grgDocTitle?.trim() ||
      process.env.GRG_OUTPUT_TITLE?.trim() ||
      process.env.GRG_DOC_TITLE?.trim() ||
      "";

    const songListLines = buildSongListLines(body.songList ?? []);
    const roster = rosterFromPayload(body);
    const rosterPreview = buildRosterPreviewFromPco(roster, undefined, body.rosterSelections);

    const sections: Array<{
      title: string;
      bodyPreview: string;
      skipped: boolean;
      status: "skipped" | "no-selection" | "ready" | "error";
      importMode?: string;
    }> = [];

    const tokens = await loadTokensForCurrentSession();
    const driveConnected = Boolean(tokens && googleConnected(tokens));

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

      if (!driveConnected || !tokens) {
        sections.push({
          title: song.title,
          bodyPreview: "(connect Google to preview)",
          skipped: false,
          status: "no-selection",
        });
        continue;
      }

      try {
        let bodyPreview = "";
        let importMode = "styled";

        try {
          const source = await loadSourceGoogleDoc(tokens, song.selectedFileId);
          bodyPreview = extractPlainPreview(source);
        } catch {
          const text = await exportDriveFilePlainTextForTokens(tokens, song.selectedFileId);
          bodyPreview = text.slice(0, 1200) + (text.length > 1200 ? "\n…" : "");
          importMode = "plain";
        }

        sections.push({
          title: song.title,
          bodyPreview,
          skipped: false,
          status: "ready",
          importMode,
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
        roster: roster.map((r) => ({
          pcoPositionName: r.pcoPositionName,
          positionName: r.positionName,
          displayName: r.displayName,
          teamName: r.teamName,
          status: r.status,
        })),
        rosterPreview,
        rosterPlaceholderLine: ROSTER_NAME_POSITION_PLACEHOLDER,
        sections,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
