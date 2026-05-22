import { NextResponse } from "next/server";
import { applyTemplateGrgUpdate } from "@/lib/docs/grg-template";
import { resolveGrgOutputTitle, resolveGrgTemplateRef } from "@/lib/config/grg";
import { getAuthedClients } from "@/lib/google/auth";
import { exportDocPlainText, recreateOutputFromTemplate } from "@/lib/google/drive-files";
import { resolveTemplateDoc } from "@/lib/google/grg-resolve";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import type { MvpApplyPayload } from "@/lib/mvp/types";

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

    const sections: Array<{ title: string; bodyText: string }> = [];
    const errors: string[] = [];

    for (const song of body.songs ?? []) {
      if (song.skipped) continue;
      if (!song.selectedFileId) {
        errors.push(`${song.title}: no file selected.`);
        continue;
      }
      try {
        const bodyText = await exportDocPlainText(drive, song.selectedFileId);
        sections.push({ title: song.title, bodyText });
      } catch (e) {
        errors.push(`${song.title}: ${e instanceof Error ? e.message : "export failed"}`);
      }
    }

    const result = await applyTemplateGrgUpdate(docs, output.id, {
      dateFormatted: body.dateFormatted,
      songList: body.songList,
      sections,
      skipIntro: Boolean(body.skipIntro),
      skipScans: sections.length === 0,
    });

    return NextResponse.json({
      ok: true,
      grg: { id: output.id, name: output.name, webViewLink: output.webViewLink },
      template: { id: template.id, name: template.name, webViewLink: template.webViewLink },
      result,
      errors,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
