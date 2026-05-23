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
  /** Set when attachment came from a specific arrangement's attachment list. */
  sourceArrangementId?: string;
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

export function normalizeForMatch(s: string) {
  return s
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

function normalizedNoSpaces(name: string) {
  return normalizeForMatch(name).replaceAll(" ", "");
}

/** True when the attachment name indicates a MASTER song scan (green tier). */
export function isMasterScanName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (n.toLowerCase().startsWith(GREEN_PREFIX)) return true;
  const compact = normalizedNoSpaces(n);
  return compact.includes("songscan") && compact.includes("master");
}

/** True when the name looks like any song scan attachment (master or secondary). */
export function isSongScanCandidateName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (isMasterScanName(n)) return true;
  return normalizedNoSpaces(n).includes("songscan");
}

export function classifyAttachmentTier(name: string): ScanTier | null {
  const n = name.trim();
  if (!n) return null;
  if (isMasterScanName(n)) return "green";
  if (normalizedNoSpaces(n).includes("songscan")) return "yellow";
  return null;
}

function attachmentPreferenceScore(a: PcoAttachment, preferredArrangementId?: string | null) {
  let score = 0;
  if (preferredArrangementId && a.sourceArrangementId === preferredArrangementId) score += 100;
  if (attachmentUrl(a)) score += 10;
  return score;
}

function pickPreferredAttachment(
  attachments: PcoAttachment[],
  preferredArrangementId?: string | null,
): PcoAttachment | undefined {
  if (attachments.length === 0) return undefined;
  return attachments.toSorted(
    (a, b) =>
      attachmentPreferenceScore(b, preferredArrangementId) -
      attachmentPreferenceScore(a, preferredArrangementId),
  )[0];
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
      const arrangementAttachments = (Array.isArray(atJson.data) ? atJson.data : []).map((a) => ({
        ...a,
        sourceArrangementId: arrangementId,
      }));
      return [...directAttachments, ...arrangementAttachments];
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
    const arrangementAttachments = (Array.isArray(atJson.data) ? atJson.data : []).map((att) => ({
      ...att,
      sourceArrangementId: a.id,
    }));
    collected.push(...arrangementAttachments);
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

export function pickBestScanAttachment(
  attachments: PcoAttachment[],
  preferredArrangementId?: string | null,
): ScanPick | null {
  const scanAttachments = attachments.filter(
    (a) => a.id && isSongScanCandidateName(attachmentName(a)),
  );
  if (scanAttachments.length === 0) return null;

  const masters = scanAttachments.filter((a) => classifyAttachmentTier(attachmentName(a)) === "green");
  const pool = masters.length > 0 ? masters : scanAttachments;
  const picked = pickPreferredAttachment(pool, preferredArrangementId);
  if (!picked?.id) return null;

  const tier = classifyAttachmentTier(attachmentName(picked)) ?? "yellow";
  return {
    tier,
    name:
      attachmentName(picked) ||
      (tier === "green" ? "(Resources) Song Scan MASTER" : "song scan"),
    url: attachmentUrl(picked),
    attachmentId: picked.id,
    arrangementId: picked.sourceArrangementId,
  };
}
