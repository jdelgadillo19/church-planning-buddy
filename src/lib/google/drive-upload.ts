import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { drive_v3 } from "@/lib/google/api-types";
import { SHARED_DRIVE_OPTS } from "./drive-files";
import { listMatchingFolders } from "./grg-drive-folders";

export type UploadedDriveFile = {
  name: string;
  driveFileId: string;
  sha256: string;
  mimeType: string;
};

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function findFileByNameInFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | null> {
  const escaped = name.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const q =
    `name = '${escaped}' and '${parentId}' in parents and trashed=false`;
  const list = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 5,
    corpora: "allDrives",
    ...SHARED_DRIVE_OPTS,
  });
  return list.data.files?.[0]?.id ?? null;
}

/** Replace an existing same-named file in the folder, or create a new one. */
export async function upsertFileInFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
  body: Buffer,
  mimeType: string,
): Promise<UploadedDriveFile> {
  const sha256 = sha256Hex(body);
  const existingId = await findFileByNameInFolder(drive, parentId, name);

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media: { mimeType, body: Readable.from(body) },
      ...SHARED_DRIVE_OPTS,
    });
    return { name, driveFileId: existingId, sha256, mimeType };
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      parents: [parentId],
      mimeType,
    },
    media: { mimeType, body: Readable.from(body) },
    fields: "id",
    ...SHARED_DRIVE_OPTS,
  });

  const id = created.data.id;
  if (!id) throw new Error(`Drive upload failed for "${name}".`);
  return { name, driveFileId: id, sha256, mimeType };
}

export async function upsertJsonInFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
  data: unknown,
): Promise<UploadedDriveFile> {
  const body = Buffer.from(JSON.stringify(data, null, 2), "utf8");
  return upsertFileInFolder(drive, parentId, name, body, "application/json");
}
