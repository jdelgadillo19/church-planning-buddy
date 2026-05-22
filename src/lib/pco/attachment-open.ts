import { formatPcoError, pcoGetJson } from "./client";
import { isGoogleDriveUrl } from "@/lib/google/drive-url";

/** Legacy PCO web URLs (arrangement page) — not Google Drive. */
export function isPcoServicesWebUrl(url: string) {
  return /^https:\/\/services\.planningcenteronline\.com\//i.test(url.trim());
}

async function pcoPostJson(url: string, auth: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: auth, accept: "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return { res, parsed: { kind: "json" as const, json: JSON.parse(text) } };
  } catch {
    return { res, parsed: { kind: "text" as const, text } };
  }
}

function readAttachmentUrlFromOpenResponse(json: unknown): string {
  const data = (json as { data?: { attributes?: { attachment_url?: string } } }).data;
  return data?.attributes?.attachment_url?.trim() ?? "";
}

/**
 * PCO "open" action returns the real file URL (often Google Drive).
 * @see https://api.planningcenteronline.com/docs/apps/services/versions/2018-08-01/vertices/attachment
 */
export async function openPcoAttachmentUrl(
  auth: string,
  attachmentId: string,
  ctx?: { songId?: string; arrangementId?: string },
): Promise<string> {
  const attempts: string[] = [];

  if (ctx?.songId && ctx.arrangementId) {
    attempts.push(
      `https://api.planningcenteronline.com/services/v2/songs/${ctx.songId}/arrangements/${ctx.arrangementId}/attachments/${attachmentId}/open`,
    );
  }
  attempts.push(`https://api.planningcenteronline.com/services/v2/attachments/${attachmentId}/open`);

  let lastError = "Could not open PCO attachment.";

  for (const url of attempts) {
    const { res, parsed } = await pcoPostJson(url, auth);
    if (!res.ok) {
      if (parsed.kind === "json") lastError = formatPcoError(res.status, parsed.json);
      else lastError = `Planning Center open failed (${res.status})`;
      continue;
    }
    if (parsed.kind !== "json") continue;
    const attachmentUrl = readAttachmentUrlFromOpenResponse(parsed.json);
    if (attachmentUrl) return attachmentUrl;
  }

  throw new Error(lastError);
}

export async function resolveScanDriveUrl(
  auth: string,
  input: {
    url: string;
    attachmentId?: string;
    songId?: string;
    arrangementId?: string;
  },
): Promise<string> {
  const direct = input.url.trim();
  if (direct && isGoogleDriveUrl(direct)) return direct;

  if (!input.attachmentId) {
    if (direct && !isPcoServicesWebUrl(direct)) return direct;
    return "";
  }

  try {
    const opened = await openPcoAttachmentUrl(auth, input.attachmentId, {
      songId: input.songId,
      arrangementId: input.arrangementId,
    });
    if (opened && isGoogleDriveUrl(opened)) return opened;
    if (opened && !isPcoServicesWebUrl(opened)) return opened;
    return opened;
  } catch {
    if (direct && !isPcoServicesWebUrl(direct)) return direct;
    return "";
  }
}
