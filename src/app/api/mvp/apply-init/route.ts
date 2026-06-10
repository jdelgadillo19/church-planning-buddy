import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getAuthedClients } from "@/lib/google/auth";
import { resolveGrgTemplateRef } from "@/lib/config/grg";
import { resolveTemplateDoc } from "@/lib/google/grg-resolve";
import {
  applySongsToImport,
  collectRosterSlotErrors,
  isApplyTemplateBlocking,
  loadTemplateValidation,
  runApplyInit,
  type ApplyGrgBody,
} from "@/lib/mvp/apply-grg";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ApplyGrgBody;

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
    const { drive } = getAuthedClients(tokens!);
    const template = await resolveTemplateDoc(tokens!, drive, templateRef);

    const templateValidation = await loadTemplateValidation(tokens!, template.id);
    if (isApplyTemplateBlocking(templateValidation, body)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Template is missing required placeholders. See templateValidation.issues.",
          templateValidation,
        },
        { status: 400 },
      );
    }

    const init = await runApplyInit(tokens!, drive, body);
    const errors = [...init.errors, ...collectRosterSlotErrors(templateValidation)];

    return NextResponse.json({
      ok: true,
      grg: init.grg,
      template: init.template,
      scanStyleSpec: init.scanStyleSpec,
      result: init.result,
      songsToImport: applySongsToImport(body),
      errors,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply init failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
