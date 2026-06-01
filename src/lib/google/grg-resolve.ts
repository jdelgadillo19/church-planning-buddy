import type { drive_v3 } from "googleapis";
import type { GrgTemplateRef } from "@/lib/config/grg";
import type { DriveCandidate } from "./drive-files";
import { findGrgTemplateDoc } from "./grg-drive-folders";

export async function resolveTemplateDoc(
  drive: drive_v3.Drive,
  ref: GrgTemplateRef,
): Promise<DriveCandidate> {
  return findGrgTemplateDoc(drive, ref);
}
