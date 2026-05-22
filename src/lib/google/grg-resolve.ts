import type { drive_v3 } from "googleapis";
import type { GrgTemplateRef } from "@/lib/config/grg";
import { findDocById, findDocByTitle, type DriveCandidate } from "./drive-files";

export async function resolveTemplateDoc(
  drive: drive_v3.Drive,
  ref: GrgTemplateRef,
): Promise<DriveCandidate> {
  if (ref.id) {
    const byId = await findDocById(drive, ref.id);
    if (byId) return byId;
  }

  const byTitle = await findDocByTitle(drive, ref.title);
  if (byTitle) return byTitle;

  const hint = ref.id
    ? `id ${ref.id} or title "${ref.title}"`
    : `title "${ref.title}"`;
  throw new Error(
    `GRG template not found (${hint}). Create it per docs/GRG-TEMPLATE.md and set GRG_TEMPLATE_TITLE or GRG_TEMPLATE_ID.`,
  );
}
