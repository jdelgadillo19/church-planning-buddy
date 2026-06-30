import { getCloudflareContext } from "@opennextjs/cloudflare";

const PULL_TTL_MS = 60 * 60 * 1000;

export type StagedFilebasePull = {
  pullId: string;
  downloadUrl: string;
};

function pullObjectKey(orgId: string, pullId: string): string {
  return `filebase-pulls/${orgId}/${pullId}.zip`;
}

/** Stage zip on R2 for browser download (avoids huge base64 JSON on Workers). */
export async function stageFilebasePullZip(input: {
  orgId: string;
  userId: string;
  planId: string;
  fileName: string;
  zip: Buffer;
}): Promise<StagedFilebasePull | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = env.RIG_DOWNLOADS;
    if (!bucket) return null;

    const pullId = crypto.randomUUID();
    const key = pullObjectKey(input.orgId, pullId);
    const createdAt = Date.now();

    // Pass a view over the existing bytes instead of `new Uint8Array(zip)`,
    // which would copy the entire zip and double peak memory on the Worker.
    const zipView = new Uint8Array(
      input.zip.buffer,
      input.zip.byteOffset,
      input.zip.byteLength,
    );
    await bucket.put(key, zipView, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: {
        planId: input.planId,
        orgId: input.orgId,
        userId: input.userId,
        fileName: input.fileName,
        createdAt: String(createdAt),
        expiresAt: String(createdAt + PULL_TTL_MS),
      },
    });

    const qs = new URLSearchParams({ id: pullId, orgId: input.orgId });
    return { pullId, downloadUrl: `/api/filebase/pull/download?${qs.toString()}` };
  } catch (e) {
    console.error("stageFilebasePullZip failed", {
      orgId: input.orgId,
      planId: input.planId,
      zipBytes: input.zip.byteLength,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function loadStagedFilebasePull(input: {
  orgId: string;
  pullId: string;
}): Promise<{ body: ReadableStream; fileName: string; size?: number } | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = env.RIG_DOWNLOADS;
    if (!bucket) return null;

    const key = pullObjectKey(input.orgId, input.pullId);
    const object = await bucket.get(key);
    if (!object) return null;

    const meta = object.customMetadata ?? {};
    if (meta.orgId && meta.orgId !== input.orgId) return null;

    const expiresAt = Number.parseInt(meta.expiresAt ?? "", 10);
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) return null;

    const fileName = meta.fileName?.trim() || `filebase-pull-${input.pullId}.zip`;
    if (!object.body) return null;

    return { body: object.body, fileName, size: object.size };
  } catch {
    return null;
  }
}
