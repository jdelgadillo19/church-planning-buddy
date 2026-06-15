import { NextResponse } from "next/server";
import { googleConnected, loadTokensForCurrentSession } from "@/app/api/auth/google/_session";
import { resolveGrgOutputTitle } from "@/lib/config/grg";
import { exportGoogleDocPdfForTokens, resolveGrgExportFileId } from "@/lib/google/drive-fetch";
import { buildAuthHeader, parsePositiveIntOrNull, pcoUploadFile } from "@/lib/pco/client";
import {
  createGrgItemAttachment,
  deleteGrgAttachment,
  listGrgItemPdfAttachments,
} from "@/lib/pco/grg-attachments";
import { resolveNextGrgPdfUpload } from "@/lib/pco/grg-pdf-filename";
import { findGrgPlanItem } from "@/lib/pco/grg-plan-item";

export type ExportGrgRequest = {
  planId: string;
  serviceTypeId: string;
  grgDocId: string;
  grgTitle: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ExportGrgRequest;

    const planId = parsePositiveIntOrNull(body.planId);
    const serviceTypeId = parsePositiveIntOrNull(body.serviceTypeId);
    const grgDocId = body.grgDocId?.trim();
    const grgTitle = body.grgTitle?.trim();

    if (!planId) {
      return NextResponse.json({ ok: false, error: "Missing or invalid planId." }, { status: 400 });
    }
    if (!serviceTypeId) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid serviceTypeId." },
        { status: 400 },
      );
    }
    if (!grgDocId) {
      return NextResponse.json({ ok: false, error: "Missing grgDocId." }, { status: 400 });
    }
    if (!grgTitle) {
      return NextResponse.json({ ok: false, error: "Missing grgTitle." }, { status: 400 });
    }

    const auth = buildAuthHeader();
    if (!auth) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Planning Center auth. Set PCO_ACCESS_TOKEN or PCO_BASIC_TOKEN in .env.local.",
        },
        { status: 500 },
      );
    }

    const tokens = await loadTokensForCurrentSession();
    if (!googleConnected(tokens)) {
      return NextResponse.json({ ok: false, error: "Google Drive not connected." }, { status: 401 });
    }

    const outputTitle = resolveGrgOutputTitle({ grgDocTitle: grgTitle });
    const { fileId: exportFileId } = await resolveGrgExportFileId(tokens!, {
      grgDocId,
      outputTitle,
    });

    const pdfBuffer = await exportGoogleDocPdfForTokens(tokens!, exportFileId);

    const grgItem = await findGrgPlanItem(serviceTypeId, planId, auth);
    const existing = await listGrgItemPdfAttachments(serviceTypeId, planId, grgItem.id, auth);
    const { nextFilename, attachmentIdToDelete } = resolveNextGrgPdfUpload({
      baseStem: grgTitle,
      existing,
    });

    if (attachmentIdToDelete) {
      await deleteGrgAttachment(attachmentIdToDelete, auth);
    }

    const fileUploadId = await pcoUploadFile(auth, pdfBuffer, nextFilename);
    const created = await createGrgItemAttachment(serviceTypeId, planId, grgItem.id, auth, {
      fileUploadId,
      filename: nextFilename,
    });

    return NextResponse.json({
      ok: true,
      filename: nextFilename,
      attachmentId: created.attachmentId,
      itemId: grgItem.id,
      itemTitle: grgItem.title,
      deletedAttachmentId: attachmentIdToDelete,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export to Planning Center failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
