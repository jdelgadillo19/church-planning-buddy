import type { ZipEntry } from "@/lib/zip/buffer-zip";

function findEndOfCentralDirectory(buf: Buffer): number {
  const sig = 0x06054b50;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  throw new Error("Invalid zip: end of central directory not found.");
}

/** Extract entries from a store-only zip built by buildStoreZip. */
export function extractStoreZip(buf: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let pos = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error("Invalid zip: bad central directory signature.");
    }
    const compression = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;

    if (compression !== 0) {
      throw new Error(`Unsupported zip compression for ${name} (only store method supported).`);
    }

    const localPos = localHeaderOffset;
    if (buf.readUInt32LE(localPos) !== 0x04034b50) {
      throw new Error(`Invalid zip: bad local header for ${name}.`);
    }
    const localNameLen = buf.readUInt16LE(localPos + 26);
    const localExtraLen = buf.readUInt16LE(localPos + 28);
    const dataStart = localPos + 30 + localNameLen + localExtraLen;
    const size = uncompressedSize || compressedSize;
    const data = Buffer.from(buf.subarray(dataStart, dataStart + size));
    entries.push({ path: name.replace(/\\/g, "/"), data });
  }

  if (centralDirOffset + centralDirSize !== eocdOffset) {
    throw new Error("Invalid zip: central directory size mismatch.");
  }

  return entries;
}
