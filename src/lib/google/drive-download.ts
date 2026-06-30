import { gunzipSync } from "node:zlib";
import type { drive_v3 } from "@/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "./drive-files";

/** True when the buffer starts with the gzip magic bytes (0x1f 0x8b). */
function isGzip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/**
 * Download raw file bytes from Drive (googleapis SDK).
 *
 * Drive serves downloads with `Content-Encoding: gzip`, but with
 * `responseType: "arraybuffer"` gaxios returns the raw compressed bytes without
 * decompressing. Saving those gzipped bytes as a `.pro` makes ProPresenter render
 * blank/placeholder slides, so we transparently gunzip when the payload is gzip.
 */
export async function driveDownloadFileBytes(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: "media", ...SHARED_DRIVE_OPTS },
    { responseType: "arraybuffer" },
  );
  const data = res.data as ArrayBuffer;
  const buf = Buffer.from(data);
  return isGzip(buf) ? gunzipSync(buf) : buf;
}
