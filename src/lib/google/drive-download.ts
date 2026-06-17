import type { drive_v3 } from "@/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "./drive-files";

/** Download raw file bytes from Drive (googleapis SDK). */
export async function driveDownloadFileBytes(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: "media", ...SHARED_DRIVE_OPTS },
    { responseType: "arraybuffer" },
  );
  const data = res.data as ArrayBuffer;
  return Buffer.from(data);
}
