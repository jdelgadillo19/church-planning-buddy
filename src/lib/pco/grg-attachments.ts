import { pcoDeleteOrThrow, pcoGetJson, pcoGetJsonOrThrow, pcoPostJsonOrThrow } from "./client";
import type { GrgPdfAttachmentRef } from "./grg-pdf-filename";

export type PcoItemAttachment = GrgPdfAttachmentRef;

type PcoAttachmentRow = {
  id?: string;
  attributes?: {
    filename?: string | null;
    display_name?: string | null;
    content_type?: string | null;
    filetype?: string | null;
  };
  relationships?: {
    attachable?: { data?: { type?: string; id?: string } | null };
  };
};

function attachmentFilename(row: PcoAttachmentRow): string {
  return (row.attributes?.filename ?? row.attributes?.display_name ?? "").trim();
}

function isPdfAttachment(row: PcoAttachmentRow): boolean {
  const name = attachmentFilename(row).toLowerCase();
  if (name.endsWith(".pdf")) return true;
  const ct = (row.attributes?.content_type ?? "").toLowerCase();
  const ft = (row.attributes?.filetype ?? "").toLowerCase();
  return ct.includes("pdf") || ft === "pdf";
}

function itemAttachmentsUrl(serviceTypeId: number, planId: number, itemId: string) {
  return `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}/attachments?per_page=100`;
}

function planAttachmentsUrl(serviceTypeId: number, planId: number) {
  return `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/attachments?per_page=100&filter=attachable_type&attachable_type=Item`;
}

function globalAttachmentDeleteUrl(attachmentId: string) {
  return `https://api.planningcenteronline.com/services/v2/attachments/${attachmentId}`;
}

function itemAttachmentCreateUrl(serviceTypeId: number, planId: number, itemId: string) {
  return `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}/attachments`;
}

function mapPdfRows(rows: PcoAttachmentRow[], itemId: string): PcoItemAttachment[] {
  return rows
    .filter((row) => {
      if (!row.id || !isPdfAttachment(row)) return false;
      const attachable = row.relationships?.attachable?.data;
      if (attachable?.type === "Item" && attachable.id && attachable.id !== itemId) return false;
      return true;
    })
    .map((row) => ({
      id: row.id!,
      filename: attachmentFilename(row),
    }))
    .filter((a) => a.filename.length > 0);
}

export async function listGrgItemPdfAttachments(
  serviceTypeId: number,
  planId: number,
  itemId: string,
  auth: string,
): Promise<PcoItemAttachment[]> {
  const nestedUrl = itemAttachmentsUrl(serviceTypeId, planId, itemId);
  const nested = await pcoGetJson(nestedUrl, auth);
  if (nested.res.ok && nested.parsed.kind === "json") {
    const rows = (nested.parsed.json as { data?: PcoAttachmentRow[] }).data ?? [];
    return mapPdfRows(rows, itemId);
  }

  const planUrl = planAttachmentsUrl(serviceTypeId, planId);
  const planResp = await pcoGetJsonOrThrow(planUrl, auth);
  const rows = (planResp as { data?: PcoAttachmentRow[] }).data ?? [];
  return mapPdfRows(
    rows.filter((row) => row.relationships?.attachable?.data?.id === itemId),
    itemId,
  );
}

export async function deleteGrgAttachment(attachmentId: string, auth: string): Promise<void> {
  await pcoDeleteOrThrow(globalAttachmentDeleteUrl(attachmentId), auth);
}

export async function createGrgItemAttachment(
  serviceTypeId: number,
  planId: number,
  itemId: string,
  auth: string,
  input: { fileUploadId: string; filename: string },
): Promise<{ attachmentId: string }> {
  const url = itemAttachmentCreateUrl(serviceTypeId, planId, itemId);
  const body = {
    data: {
      attributes: {
        file_upload_identifier: input.fileUploadId,
        filename: input.filename,
      },
    },
  };

  const json = await pcoPostJsonOrThrow(url, auth, body);
  const id = (json as { data?: { id?: string } }).data?.id;
  if (!id?.trim()) throw new Error("Planning Center did not return an attachment id after create.");
  return { attachmentId: id.trim() };
}
