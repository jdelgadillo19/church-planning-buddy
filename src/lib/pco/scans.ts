import { pcoGetJson } from "./client";
import { isPcoServicesWebUrl } from "./attachment-open";
import { isGoogleDriveUrl } from "@/lib/google/drive-url";

export type ScanTier = "green" | "yellow" | "red";

export type PcoAttachment = {
  id?: string;
  attributes?: {
    display_name?: string | null;
    filename?: string | null;
    linked_url?: string | null;
    remote_link?: string | null;
    url?: string | null;
  };
};

const GREEN_PREFIX = "(resources) song scan master";

export function attachmentName(a: PcoAttachment) {
  const dn = a.attributes?.display_name?.trim();
  if (dn) return dn;
  return a.attributes?.filename?.trim() ?? "";
}

/** Prefer Drive/external URLs; ignore legacy PCO arrangement page URLs in `url`. */
export function attachmentUrl(a: PcoAttachment) {
  const candidates = [
    a.attributes?.linked_url?.trim(),
    a.attributes?.remote_link?.trim(),
    a.attributes?.url?.trim(),
  ].filter((u): u is string => Boolean(u));

  for (const u of candidates) {
    if (isPcoServicesWebUrl(u)) continue;
    if (isGoogleDriveUrl(u)) return u;
  }

  for (const u of candidates) {
    if (isPcoServicesWebUrl(u)) continue;
    return u;
  }

  return "";
}

export function classifyAttachmentTier(name: string): ScanTier | null {
  const n = name.trim();
  if (!n) return null;
  if (n.toLowerCase().startsWith(GREEN_PREFIX)) return "green";
  const normalized = n
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
  if (normalized.replaceAll(" ", "").includes("songscan")) return "yellow";
  return null;
}

export async function listSongAttachments(
  songId: string,
  auth: string,
  arrangementId?: string | null,
) {
  const directUrl = `https://api.planningcenteronline.com/services/v2/songs/${songId}/attachments?per_page=100&order=-created_at`;
  const direct = await pcoGetJson(directUrl, auth);
  const directAttachments: PcoAttachment[] = [];
  if (direct.res.ok && direct.parsed.kind === "json") {
    const parsed = direct.parsed.json as { data?: PcoAttachment[] };
    directAttachments.push(...(Array.isArray(parsed.data) ? parsed.data : []));
  }

  if (arrangementId) {
    const url = `https://api.planningcenteronline.com/services/v2/songs/${songId}/arrangements/${arrangementId}/attachments?per_page=100&order=-created_at`;
    const at = await pcoGetJson(url, auth);
    if (at.res.ok && at.parsed.kind === "json") {
      const atJson = at.parsed.json as { data?: PcoAttachment[] };
      return [...directAttachments, ...(Array.isArray(atJson.data) ? atJson.data : [])];
    }
    return directAttachments;
  }

  const arrangementsUrl = `https://api.planningcenteronline.com/services/v2/songs/${songId}/arrangements?per_page=100&order=-updated_at`;
  const arr = await pcoGetJson(arrangementsUrl, auth);
  if (!arr.res.ok || arr.parsed.kind !== "json") return directAttachments;

  const arrangements = (arr.parsed.json as { data?: { id: string }[] }).data ?? [];
  const collected: PcoAttachment[] = [];
  for (const a of arrangements) {
    if (!a?.id) continue;
    const url = `https://api.planningcenteronline.com/services/v2/songs/${songId}/arrangements/${a.id}/attachments?per_page=100&order=-created_at`;
    const at = await pcoGetJson(url, auth);
    if (!at.res.ok || at.parsed.kind !== "json") continue;
    const atJson = at.parsed.json as { data?: PcoAttachment[] };
    collected.push(...(Array.isArray(atJson.data) ? atJson.data : []));
  }

  return [...directAttachments, ...collected];
}

export type ScanPick = {
  tier: ScanTier;
  name: string;
  url: string;
  attachmentId?: string;
  arrangementId?: string;
};

export function pickBestScanAttachment(attachments: PcoAttachment[]): ScanPick | null {
  const green = attachments.find((a) => classifyAttachmentTier(attachmentName(a)) === "green");
  if (green?.id) {
    return {
      tier: "green",
      name: attachmentName(green) || "(Resources) Song Scan MASTER",
      url: attachmentUrl(green),
      attachmentId: green.id,
    };
  }

  const yellow = attachments.filter((a) => classifyAttachmentTier(attachmentName(a)) === "yellow");
  if (yellow.length > 0) {
    const first = yellow[0];
    if (first?.id) {
      return {
        tier: "yellow",
        name: attachmentName(first) || "song scan",
        url: attachmentUrl(first),
        attachmentId: first.id,
      };
    }
  }

  return null;
}
