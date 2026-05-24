import { NextResponse } from "next/server";
import { applyTemplateGrgUpdate } from "@/lib/docs/grg-template";
import { importScanSection } from "@/lib/docs/scan-import";
import { resolveGrgOutputTitle, resolveGrgTemplateRef } from "@/lib/config/grg";
import { getAuthedClients } from "@/lib/google/auth";
import { recreateOutputFromTemplate } from "@/lib/google/drive-files";
import { resolveTemplateDoc } from "@/lib/google/grg-resolve";
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
    const body = (await req.json()) as MvpApplyPayload & {
      confirmed?: boolean;
      templateTitle?: string;
      templateId?: string;
    };

    if (!body.confirmed) {
      return NextResponse.json(
        { ok: false, error: "Signoff required. Set confirmed: true to apply changes." },
        { status: 400 },
      );
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    const templateRef = resolveGrgTemplateRef({
      templateTitle: body.templateTitle,
      templateId: body.templateId,
    });
    const outputTitle = resolveGrgOutputTitle({ grgDocTitle: body.grgDocTitle });

    const { drive, docs } = getAuthedClients(tokens!);
    const template = await resolveTemplateDoc(drive, templateRef);
    const output = await recreateOutputFromTemplate(drive, template.id, outputTitle);

    const errors: string[] = [];
    const scanImports: Array<{ title: string; mode: string; warning?: string }> = [];

    const hasScans = (body.songs ?? []).some((s) => !s.skipped && s.selectedFileId);

    const result = await applyTemplateGrgUpdate(docs, output.id, {
      dateFormatted: body.dateFormatted,
      songList: body.songList,
      sections: [],
      roster: rosterFromPayload(body),
      skipIntro: Boolean(body.skipIntro),
      skipScans: !hasScans || Boolean(body.skipScans),
    });

    let addPageBreak = true;
    for (const song of body.songs ?? []) {
      if (song.skipped) continue;
      if (!song.selectedFileId) {
        errors.push(`${song.title}: no file selected.`);
        continue;
      }
      try {
        const imported = await importScanSection(
          docs,
          drive,
          output.id,
          song.selectedFileId,
          song.title,
          addPageBreak,
        );
        addPageBreak = true;
        scanImports.push({
          title: song.title,
          mode: imported.mode,
          warning: imported.warning,
        });
        if (imported.warning) {
          errors.push(`${song.title}: ${imported.warning} (import mode: ${imported.mode})`);
        }
      } catch (e) {
        errors.push(`${song.title}: ${e instanceof Error ? e.message : "import failed"}`);
      }
    }

    return NextResponse.json({
      ok: true,
      grg: { id: output.id, name: output.name, webViewLink: output.webViewLink },
      template: { id: template.id, name: template.name, webViewLink: template.webViewLink },
      result,
      scanImports,
      errors,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
