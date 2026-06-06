import type { GoogleTokens } from "@/app/api/auth/google/_session";
import type { drive_v3 } from "@/lib/google/api-types";
import type { GrgTemplateRef } from "@/lib/config/grg";
import type { DriveCandidate } from "./drive-files";
import { findGrgTemplateDoc } from "./grg-drive-folders";

export async function resolveTemplateDoc(
  tokens: GoogleTokens,
  drive: drive_v3.Drive,
  ref: GrgTemplateRef,
): Promise<DriveCandidate> {
  return findGrgTemplateDoc(tokens, drive, ref);
}
