import { NextResponse } from "next/server";
import { resolveGrgOutputTitle, resolveGrgTemplateRef } from "@/lib/config/grg";
import { findGrgOutputDocFallback } from "@/lib/google/grg-drive-folders";
import { resolveTemplateDoc } from "@/lib/google/grg-resolve";
import { getAuthedClients } from "@/lib/google/auth";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      templateTitle?: string;
      templateId?: string;
    };

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    const templateRef = resolveGrgTemplateRef({
      templateTitle: body.templateTitle,
      templateId: body.templateId,
    });
    const outputTitle = resolveGrgOutputTitle({ grgDocTitle: body.title });

    const { drive } = getAuthedClients(tokens!);
    const template = await resolveTemplateDoc(drive, templateRef);
    const output = await findGrgOutputDocFallback(drive, outputTitle);

    return NextResponse.json({
      ok: true,
      mode: "template-copy" as const,
      template,
      output: output ?? null,
      outputTitle,
      doc: output ?? undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to verify GRG setup.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
