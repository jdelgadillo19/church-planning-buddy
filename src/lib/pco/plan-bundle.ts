import { buildAuthHeader, formatPcoError, parsePositiveIntOrNull, pcoGetJson, pcoGetJsonOrThrow } from "./client";
import { buildOutputDocTitle } from "@/lib/config/grg";
import { formatPlanDateLikeSample } from "./format-date";
import { formatPitchKey, keyFromItemAttribute } from "./format-key";
import { formatArrangementDisplayName } from "./arrangement-display";
import { resolveScanDriveUrl } from "./attachment-open";
import { loadPlanTeamMembers, loadPlanTeamPositionNames, type PlanRosterRow } from "./plan-team";
import { persistNewPcoPositions } from "./roster-position-sync";
import { listSongAttachments, pickBestScanAttachment, type ScanTier } from "./scans";

export type { PlanRosterRow } from "./plan-team";

export type PlanSongRow = {
  itemId: string;
  title: string;
  key: string;
  artist: string;
  sequence: number;
  scanTier: ScanTier;
  scanName: string;
  scanUrl: string;
  scanAttachmentId?: string;
  songId?: string;
  arrangementId?: string;
  warnings: string[];
};

export type PlanBundle = {
  planId: number;
  serviceTypeId: number;
  dateFormatted: string;
  dateRaw: string;
  suggestedOutputTitle: string;
  songs: PlanSongRow[];
  roster: PlanRosterRow[];
  rosterMapAdded: string[];
};

type PcoItem = {
  id: string;
  attributes?: {
    title?: string | null;
    item_type?: string | null;
    key_name?: string | null;
    position?: number | null;
    sequence?: number | null;
  };
  relationships?: {
    song?: { data?: { id: string } | null };
    key?: { data?: { id: string } | null };
    arrangement?: { data?: { id: string } | null };
  };
};

type PcoSong = {
  id: string;
  type?: string;
  attributes?: { title?: string | null; author?: string | null };
};

type PcoArrangement = {
  id: string;
  type?: string;
  attributes?: { name?: string | null };
};

type PcoKey = {
  id: string;
  type?: string;
  attributes?: {
    name?: string | null;
    starting_key?: string | null;
    starting_minor?: boolean | null;
  };
};

function isSongItem(item: PcoItem) {
  const type = (item.attributes?.item_type ?? "").toLowerCase();
  if (type !== "song") return false;

  const title = (item.attributes?.title ?? "").trim().toLowerCase();
  if (/service opener|opener video|^\s*video\s*$/i.test(title)) return false;

  return true;
}

function itemSequence(item: PcoItem) {
  return item.attributes?.sequence ?? item.attributes?.position ?? 0;
}

async function resolveServiceTypeId(planId: number, auth: string, serviceTypeId: number | null) {
  if (serviceTypeId) return serviceTypeId;

  const planJson = await pcoGetJsonOrThrow(
    `https://api.planningcenteronline.com/services/v2/plans/${planId}`,
    auth,
  );
  const rawId = (planJson as { data?: { relationships?: { service_type?: { data?: { id?: string } } } } })
    .data?.relationships?.service_type?.data?.id;
  const parsed = parsePositiveIntOrNull(rawId);
  if (!parsed) throw new Error("Could not resolve Service Type ID for this Plan ID.");
  return parsed;
}

async function fetchItemKey(
  serviceTypeId: number,
  planId: number,
  itemId: string,
  auth: string,
): Promise<string> {
  try {
    const json = await pcoGetJsonOrThrow(
      `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/items/${itemId}/key`,
      auth,
    );
    const attrs = (json as { data?: { attributes?: PcoKey["attributes"] } }).data?.attributes;
    return formatPitchKey(attrs);
  } catch {
    return "";
  }
}

function resolveItemKey(
  item: PcoItem,
  keyById: Map<string, PcoKey>,
  serviceTypeId: number,
  planId: number,
  auth: string,
): Promise<string> {
  const keyId = item.relationships?.key?.data?.id;
  if (keyId) {
    const included = keyById.get(keyId);
    const fromIncluded = formatPitchKey(included?.attributes);
    if (fromIncluded) return Promise.resolve(fromIncluded);
  }

  const fromItemName = keyFromItemAttribute(item.attributes?.key_name);
  if (fromItemName) return Promise.resolve(fromItemName);

  return fetchItemKey(serviceTypeId, planId, item.id, auth);
}

async function fetchArrangementName(
  songId: string,
  arrangementId: string,
  auth: string,
): Promise<string> {
  try {
    const json = await pcoGetJsonOrThrow(
      `https://api.planningcenteronline.com/services/v2/songs/${songId}/arrangements/${arrangementId}`,
      auth,
    );
    const name = (json as { data?: { attributes?: { name?: string } } }).data?.attributes?.name;
    return formatArrangementDisplayName(name);
  } catch {
    return "";
  }
}

export async function loadPlanBundle(input: {
  planId: string;
  serviceTypeId?: string;
}): Promise<PlanBundle> {
  const auth = buildAuthHeader();
  if (!auth) {
    throw new Error(
      "Missing Planning Center auth. Set PCO_ACCESS_TOKEN or PCO_BASIC_TOKEN in .env.local.",
    );
  }

  const planId = parsePositiveIntOrNull(input.planId);
  if (!planId) throw new Error("Please provide a numeric Plan ID.");

  const serviceTypeId = await resolveServiceTypeId(
    planId,
    auth,
    parsePositiveIntOrNull(input.serviceTypeId ?? ""),
  );

  const planResp = await pcoGetJson(
    `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}`,
    auth,
  );
  if (!planResp.res.ok) {
    if (planResp.parsed.kind === "json") throw new Error(formatPcoError(planResp.res.status, planResp.parsed.json));
    throw new Error(`Planning Center request failed (${planResp.res.status})`);
  }

  const planData =
    planResp.parsed.kind === "json"
      ? (planResp.parsed.json as { data?: { attributes?: { dates?: string; sort_date?: string; short_dates?: string } } })
          .data?.attributes
      : undefined;

  const dateRaw = planData?.sort_date ?? planData?.dates ?? planData?.short_dates ?? "";
  const dateFormatted = formatPlanDateLikeSample(dateRaw);

  const itemsUrl = `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/items?include=song,key,arrangement`;
  const itemsResp = await pcoGetJson(itemsUrl, auth);
  if (!itemsResp.res.ok) {
    if (itemsResp.parsed.kind === "json") throw new Error(formatPcoError(itemsResp.res.status, itemsResp.parsed.json));
    throw new Error(`Planning Center request failed (${itemsResp.res.status})`);
  }

  const itemsJson =
    itemsResp.parsed.kind === "json"
      ? (itemsResp.parsed.json as { data?: PcoItem[]; included?: Array<PcoSong | PcoKey | PcoArrangement> })
      : { data: [], included: [] };

  const items = Array.isArray(itemsJson.data) ? itemsJson.data : [];
  const included = Array.isArray(itemsJson.included) ? itemsJson.included : [];

  const songById = new Map<string, PcoSong>();
  const keyById = new Map<string, PcoKey>();
  const arrangementById = new Map<string, PcoArrangement>();
  for (const row of included) {
    if (!row?.id) continue;
    if (row.type === "Key") keyById.set(row.id, row as PcoKey);
    else if (row.type === "Arrangement") arrangementById.set(row.id, row as PcoArrangement);
    else songById.set(row.id, row as PcoSong);
  }

  const orderedSongItems = items.filter(isSongItem).toSorted((a, b) => itemSequence(a) - itemSequence(b));

  const songs: PlanSongRow[] = [];

  for (const item of orderedSongItems) {
    const itemId = item.id;
    const title = item.attributes?.title?.trim() || "(Untitled)";
    const songId = item.relationships?.song?.data?.id;
    const warnings: string[] = [];

    const arrangementId = item.relationships?.arrangement?.data?.id;

    let artist = "";
    if (arrangementId) {
      const linkedArr = arrangementById.get(arrangementId);
      artist = formatArrangementDisplayName(linkedArr?.attributes?.name);
      if (!artist && songId) artist = await fetchArrangementName(songId, arrangementId, auth);
    }

    const key = await resolveItemKey(item, keyById, serviceTypeId, planId, auth);
    if (!key) warnings.push("Key not found on plan item.");

    let scanTier: ScanTier = "red";
    let scanName = "";
    let scanUrl = "";
    let scanAttachmentId: string | undefined;

    if (!songId) {
      warnings.push("No linked song on plan item.");
    } else {
      const attachments = await listSongAttachments(songId, auth, arrangementId);
      const pick = pickBestScanAttachment(attachments, arrangementId);
      if (!pick) {
        warnings.push("No song scan attachment found.");
      } else {
        scanTier = pick.tier;
        scanName = pick.name;
        scanAttachmentId = pick.attachmentId;
        scanUrl = await resolveScanDriveUrl(auth, {
          url: pick.url,
          attachmentId: pick.attachmentId,
          songId,
          arrangementId,
        });
        if (!scanUrl) {
          warnings.push(
            "Song scan found in PCO but Drive link could not be resolved. Try Find blank scan after reconnecting Google.",
          );
        } else if (pick.tier === "yellow") {
          warnings.push("Using non-MASTER scan (yellow tier).");
        }
      }
    }

    songs.push({
      itemId,
      title,
      key,
      artist,
      sequence: itemSequence(item),
      scanTier,
      scanName,
      scanUrl,
      scanAttachmentId,
      songId: songId ?? undefined,
      arrangementId: arrangementId ?? undefined,
      warnings,
    });
  }

  const planPositionNames = await loadPlanTeamPositionNames(serviceTypeId, planId, auth);
  const { map: positionMap, added: rosterMapAdded } = persistNewPcoPositions(planPositionNames);
  const roster = await loadPlanTeamMembers(serviceTypeId, planId, auth, positionMap);

  return {
    planId,
    serviceTypeId,
    dateFormatted,
    dateRaw: String(dateRaw),
    suggestedOutputTitle: buildOutputDocTitle(dateRaw),
    songs,
    roster,
    rosterMapAdded,
  };
}
