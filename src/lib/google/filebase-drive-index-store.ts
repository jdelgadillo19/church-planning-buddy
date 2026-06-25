import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FilebaseDriveIndex } from "./filebase-drive-index";

const INDEX_KEY = "filebase/drive-index.json";

export type StoredFilebaseDriveIndex = {
  files: FilebaseDriveIndex["files"];
  indexSource: FilebaseDriveIndex["source"];
  snapshotMetaPath?: string;
  rootId: string;
  driveSource: "shared" | "computer";
  updatedAt: string;
};

export async function loadStoredFilebaseDriveIndex(): Promise<StoredFilebaseDriveIndex | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = env.RIG_DOWNLOADS;
    if (!bucket) return null;
    const obj = await bucket.get(INDEX_KEY);
    if (!obj) return null;
    const text = await obj.text();
    const parsed = JSON.parse(text) as StoredFilebaseDriveIndex;
    if (!parsed?.files?.length || !parsed.rootId || !parsed.driveSource) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveStoredFilebaseDriveIndex(
  index: StoredFilebaseDriveIndex,
): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = env.RIG_DOWNLOADS;
    if (!bucket) return false;
    await bucket.put(INDEX_KEY, JSON.stringify(index), {
      httpMetadata: { contentType: "application/json" },
    });
    return true;
  } catch {
    return false;
  }
}
