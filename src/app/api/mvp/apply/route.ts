import { NextResponse } from "next/server";
import {
  applyTemplateGrgUpdate,
  isTemplateValidationBlocking,
  validateGrgTemplate,
} from "@/lib/docs/grg-template";
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

    const hasScans = (body.songs ?? []).some((s) => !s.skipped && s.selectedFileId);
    const skipIntro = Boolean(body.skipIntro);
    const skipScans = !hasScans || Boolean(body.skipScans);

    const templateValidation = await validateGrgTemplate(docs, template.id);
    if (
      isTemplateValidationBlocking(templateValidation, {
        skipIntro,
        skipScans,
        hasScansToApply: hasScans,
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Template is missing required placeholders. See templateValidation.issues.",
          templateValidation,
        },
        { status: 400 },
      );
    }

    const output = await recreateOutputFromTemplate(drive, template.id, outputTitle);

    const errors: string[] = [];
    const scanImports: Array<{ title: string; mode: string; warning?: string }> = [];

    const result = await applyTemplateGrgUpdate(docs, output.id, {
      dateFormatted: body.dateFormatted,
      songList: body.songList,
      sections: [],
      roster: rosterFromPayload(body),
      rosterSelections: body.rosterSelections,
      skipIntro,
      skipScans,
    });

    if (templateValidation.issues.some((i) => i.code === "missing_roster_slot")) {
      errors.push(
        ...templateValidation.issues
          .filter((i) => i.code === "missing_roster_slot")
          .map((i) => i.message),
      );
    }

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
