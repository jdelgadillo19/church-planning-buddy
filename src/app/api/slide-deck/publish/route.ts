import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { getAuthedClients } from "@/lib/google/auth";
import { loadSlideDeckBundle } from "@/lib/slide-deck/load-bundle";
import { publishSlideDeckPackage, type PublishNewFilePayload } from "@/lib/slide-deck/publish";
import type { ApplyCommitResult } from "@/lib/slide-deck/apply-commit";

export async function POST(req: Request) {
  try {
    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json(
        { ok: false, error: "Connect Google before publishing to Drive." },
        { status: 401 },
      );
    }

    const body = (await req.json()) as {
      planId?: string;
      serviceTypeId?: string;
      confirm?: boolean;
      publishedBy?: string;
      applyResult?: ApplyCommitResult;
      nativeExportPath?: string;
      newFiles?: Array<{ name: string; contentBase64: string; mimeType?: string }>;
    };

    if (body.confirm !== true) {
      return NextResponse.json(
        { ok: false, error: 'Publishing requires { "confirm": true } in the request body.' },
        { status: 400 },
      );
    }

    if (!body.planId?.trim()) {
      return NextResponse.json({ ok: false, error: "planId is required." }, { status: 400 });
    }

    const bundle = await loadSlideDeckBundle({
      planId: body.planId.trim(),
      serviceTypeId: body.serviceTypeId,
      applyResult: body.applyResult,
    });

    const newFilePayloads: PublishNewFilePayload[] = [];
    for (const file of body.newFiles ?? []) {
      if (!file.name?.trim() || !file.contentBase64) continue;
      newFilePayloads.push({
        name: file.name.trim(),
        content: Buffer.from(file.contentBase64, "base64"),
        mimeType: file.mimeType,
      });
    }

    const { drive } = getAuthedClients(tokens!);
    const result = await publishSlideDeckPackage({
      drive,
      bundle,
      publishedBy: body.publishedBy?.trim() || undefined,
      nativeExportPath: body.nativeExportPath?.trim() || undefined,
      newFilePayloads,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to publish slide deck package.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
