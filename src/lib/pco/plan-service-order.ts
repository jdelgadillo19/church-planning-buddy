import {
  buildAuthHeader,
  formatPcoError,
  parsePositiveIntOrNull,
  pcoGetJson,
  pcoGetJsonOrThrow,
} from "./client";
import { formatPlanDateLikeSample } from "./format-date";
import { formatPitchKey, keyFromItemAttribute } from "./format-key";
import { formatArrangementDisplayName } from "./arrangement-display";
import type { PcoItemTime, ServiceOrderItem, ServiceOrderPlan, ServiceOrderSong } from "@/lib/slide-deck/types";

type PcoItem = {
  id: string;
  attributes?: {
    title?: string | null;
    item_type?: string | null;
    key_name?: string | null;
    position?: number | null;
    sequence?: number | null;
    description?: string | null;
    time?: string | null;
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

type PcoKey = {
  id: string;
  type?: string;
  attributes?: {
    name?: string | null;
    starting_key?: string | null;
    starting_minor?: boolean | null;
  };
};

type PcoArrangement = {
  id: string;
  type?: string;
  attributes?: { name?: string | null };
};

function itemSequence(item: PcoItem): number {
  return item.attributes?.sequence ?? item.attributes?.position ?? 0;
}

function normalizePcoItemTime(raw: string | null | undefined): PcoItemTime {
  const value = raw?.trim().toLowerCase();
  if (value === "pre" || value === "post" || value === "during") return value;
  return "during";
}

type PcoItemsPage = {
  data?: PcoItem[];
  included?: Array<PcoSong | PcoKey | PcoArrangement>;
  links?: { next?: string | null };
};

async function fetchAllPlanItems(itemsUrl: string, auth: string): Promise<PcoItemsPage> {
  const allData: PcoItem[] = [];
  const includedByKey = new Map<string, PcoSong | PcoKey | PcoArrangement>();

  let url: string | null = `${itemsUrl}${itemsUrl.includes("?") ? "&" : "?"}per_page=100`;

  while (url) {
    const json = (await pcoGetJsonOrThrow(url, auth)) as PcoItemsPage;
    allData.push(...(json.data ?? []));
    for (const row of json.included ?? []) {
      if (!row?.id || !row.type) continue;
      includedByKey.set(`${row.type}:${row.id}`, row);
    }
    url = json.links?.next ?? null;
  }

  return { data: allData, included: [...includedByKey.values()] };
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

async function buildSongDetails(
  item: PcoItem,
  songById: Map<string, PcoSong>,
  arrangementById: Map<string, PcoArrangement>,
  keyById: Map<string, PcoKey>,
  serviceTypeId: number,
  planId: number,
  auth: string,
): Promise<ServiceOrderSong> {
  const title = item.attributes?.title?.trim() || "(Untitled)";
  const songId = item.relationships?.song?.data?.id;
  const arrangementId = item.relationships?.arrangement?.data?.id;

  let artist = "";
  if (arrangementId) {
    const linkedArr = arrangementById.get(arrangementId);
    artist = formatArrangementDisplayName(linkedArr?.attributes?.name);
    if (!artist && songId) artist = await fetchArrangementName(songId, arrangementId, auth);
  }

  const key = await resolveItemKey(item, keyById, serviceTypeId, planId, auth);

  return {
    itemId: item.id,
    title,
    key,
    artist,
    sequence: itemSequence(item),
    songId: songId ?? undefined,
    arrangementId: arrangementId ?? undefined,
  };
}

/** Full PCO service order (all plan items in sequence). PCO-only — no GRG, no scans. */
export async function loadPlanServiceOrder(input: {
  planId: string;
  serviceTypeId?: string;
}): Promise<ServiceOrderPlan> {
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
    if (planResp.parsed.kind === "json") {
      throw new Error(formatPcoError(planResp.res.status, planResp.parsed.json));
    }
    throw new Error(`Planning Center request failed (${planResp.res.status})`);
  }

  const planData =
    planResp.parsed.kind === "json"
      ? (planResp.parsed.json as {
          data?: { attributes?: { dates?: string; sort_date?: string; short_dates?: string } };
        }).data?.attributes
      : undefined;

  const dateRaw = planData?.sort_date ?? planData?.dates ?? planData?.short_dates ?? "";
  const dateFormatted = formatPlanDateLikeSample(dateRaw);

  const itemsUrl = `https://api.planningcenteronline.com/services/v2/service_types/${serviceTypeId}/plans/${planId}/items?include=song,key,arrangement`;
  let itemsJson: PcoItemsPage;
  try {
    itemsJson = await fetchAllPlanItems(itemsUrl, auth);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Planning Center request failed";
    throw new Error(message);
  }

  const rawItems = Array.isArray(itemsJson.data) ? itemsJson.data : [];
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

  const orderedItems = rawItems.toSorted((a, b) => itemSequence(a) - itemSequence(b));
  const items: ServiceOrderItem[] = [];

  for (const item of orderedItems) {
    const itemType = (item.attributes?.item_type ?? "item").trim() || "item";
    const title = item.attributes?.title?.trim() || "(Untitled)";
    const base: ServiceOrderItem = {
      itemId: item.id,
      itemType,
      title,
      sequence: itemSequence(item),
      time: normalizePcoItemTime(item.attributes?.time),
      description: item.attributes?.description?.trim() || undefined,
    };

    if (itemType.toLowerCase() === "song") {
      base.song = await buildSongDetails(
        item,
        songById,
        arrangementById,
        keyById,
        serviceTypeId,
        planId,
        auth,
      );
    }

    items.push(base);
  }

  return {
    planId,
    serviceTypeId,
    dateRaw: String(dateRaw),
    dateFormatted,
    items,
  };
}
