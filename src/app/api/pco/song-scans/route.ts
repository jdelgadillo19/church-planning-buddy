import { NextResponse } from "next/server";

type SongScansRequestBody = {
  serviceTypeId?: string;
  planId: string;
};

type PcoErrorPayload = {
  errors?: Array<{
    title?: string;
    detail?: string;
    code?: string;
  }>;
};

type PcoPlan = {
  relationships?: {
    service_type?: {
      data?: {
        id?: string;
      };
    };
  };
};

type PcoItem = {
  attributes?: {
    title?: string | null;
    item_type?: string | null;
    position?: number | null;
    sequence?: number | null;
  };
  relationships?: {
    song?: {
      data?: { id: string; type: string } | null;
    };
  };
};

type PcoAttachment = {
  attributes?: {
    display_name?: string | null;
    filename?: string | null;
    linked_url?: string | null;
    remote_link?: string | null;
    url?: string | null;
  };
};

type PcoArrangement = {
  id: string;
};

type Tier = "green" | "yellow" | "red";

type SongScanResult = {
  songTitle: string;
  tier: Tier;
  message: string;
  url?: string;
  matchCount?: number;
};

function parsePositiveIntOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

function buildAuthHeader() {
  const bearer = process.env.PCO_ACCESS_TOKEN?.trim();
  if (bearer) return `Bearer ${bearer}`;

  let basicPair = process.env.PCO_BASIC_TOKEN?.trim();
  if (!basicPair) return null;
  if (
    (basicPair.startsWith("\"") && basicPair.endsWith("\"")) ||
    (basicPair.startsWith("'") && basicPair.endsWith("'"))
  ) {
    basicPair = basicPair.slice(1, -1).trim();
  }
  if (basicPair.toLowerCase().startsWith("basic ")) return basicPair;
  const encoded = Buffer.from(basicPair, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

async function readJsonOrText(res: Response) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { kind: "json" as const, json, text };
  } catch {
    return { kind: "text" as const, text };
  }
}

function formatPcoError(status: number, data: unknown) {
  const payload = data as PcoErrorPayload;
  const first = payload?.errors?.[0];
  const title = first?.title?.trim();
  const detail = first?.detail?.trim();
  const code = first?.code?.trim();

  const bits = [title, detail, code ? `code: ${code}` : null].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  const suffix = bits.length > 0 ? ` — ${bits.join(" | ")}` : "";
  return `Planning Center request failed (${status})${suffix}`;
}

async function pcoGetJson(url: string, auth: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: auth, accept: "application/json" },
    cache: "no-store",
  });
  const parsed = await readJsonOrText(res);
  return { res, parsed };
}

function attachmentName(a: PcoAttachment) {
  const dn = a.attributes?.display_name?.trim();
  if (dn) return dn;
  const fn = a.attributes?.filename?.trim();
  if (fn) return fn;
  return "";
}

function attachmentUrl(a: PcoAttachment) {
  return (
    a.attributes?.linked_url?.trim() ||
    a.attributes?.remote_link?.trim() ||
    a.attributes?.url?.trim() ||
    ""
  );
}

function normalizeForMatch(s: string) {
  return s
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

const GREEN_PREFIX = "(resources) song scan master";

function isGreen(name: string) {
  return name.trim().toLowerCase().startsWith(GREEN_PREFIX);
}

function isYellow(name: string) {
  const n = normalizeForMatch(name);
  const noSpace = n.replaceAll(" ", "");
  return noSpace.includes("songscan");
}

function orderBySequence(a: PcoItem, b: PcoItem) {
  const sa = a.attributes?.sequence ?? a.attributes?.position ?? 0;
  const sb = b.attributes?.sequence ?? b.attributes?.position ?? 0;
  return sa - sb;
}

function isSongItem(item: PcoItem) {
  const t = item.attributes?.item_type ?? "";
  if (t.toLowerCase() === "song") return true;
  return Boolean(item.relationships?.song?.data);
}

async function listSongAttachments(songId: string, auth: string) {
  // Order newest-first so "topmost" usually wins.
  const directUrl = `https://api.planningcenteronline.com/services/v2/songs/${songId}/attachments?per_page=100&order=-created_at`;
  const direct = await pcoGetJson(directUrl, auth);
  const directAttachments: PcoAttachment[] = [];
  if (direct.res.ok && direct.parsed.kind === "json") {
    const parsed = direct.parsed.json as { data?: PcoAttachment[] };
    const attachments = Array.isArray(parsed.data) ? parsed.data : [];
    directAttachments.push(...attachments);
  }

  // Many teams attach scans to Arrangements rather than the Song root.
  const arrangementsUrl = `https://api.planningcenteronline.com/services/v2/songs/${songId}/arrangements?per_page=100&order=-updated_at`;
  const arr = await pcoGetJson(arrangementsUrl, auth);
  if (!arr.res.ok || arr.parsed.kind !== "json") return directAttachments;

  const arrJson = arr.parsed.json as { data?: PcoArrangement[] };
  const arrangements = Array.isArray(arrJson.data) ? arrJson.data : [];

  const collected: PcoAttachment[] = [];
  for (const a of arrangements) {
    if (!a?.id) continue;
    const url = `https://api.planningcenteronline.com/services/v2/songs/${songId}/arrangements/${a.id}/attachments?per_page=100&order=-created_at`;
    const at = await pcoGetJson(url, auth);
    if (!at.res.ok || at.parsed.kind !== "json") continue;
    const atJson = at.parsed.json as { data?: PcoAttachment[] };
    const attachments = Array.isArray(atJson.data) ? atJson.data : [];
    collected.push(...attachments);
  }

  return [...directAttachments, ...collected];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<SongScansRequestBody>;
    const serviceTypeId = parsePositiveIntOrNull(body.serviceTypeId);
    const planId = parsePositiveIntOrNull(body.planId);

    if (!planId) {
      return NextResponse.json({ ok: false, error: "Please provide a numeric Plan ID." }, { status: 400 });
    }

    const auth = buildAuthHeader();
    if (!auth) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing Planning Center auth. Set PCO_ACCESS_TOKEN (Bearer) or PCO_BASIC_TOKEN (basic pair) in .env.local.",
        },
        { status: 500 },
      );
    }

    let resolvedServiceTypeId = serviceTypeId;
    if (!resolvedServiceTypeId) {
      const planUrl = `https://api.planningcenteronline.com/services/v2/plans/${planId}`;
      const planResp = await pcoGetJson(planUrl, auth);
      if (!planResp.res.ok) {
        if (planResp.parsed.kind === "json") {
          return NextResponse.json(
            { ok: false, error: formatPcoError(planResp.res.status, planResp.parsed.json) },
            { status: 502 },
          );
        }
        return NextResponse.json(
          { ok: false, error: `Planning Center request failed (${planResp.res.status})` },
          { status: 502 },
        );
      }

      const planJson =
        planResp.parsed.kind === "json"
          ? (planResp.parsed.json as { data?: PcoPlan })
          : {};
      const rawId = planJson.data?.relationships?.service_type?.data?.id;
      const parsedId = parsePositiveIntOrNull(rawId);
      if (!parsedId) {
        return NextResponse.json(
          { ok: false, error: "Could not resolve Service Type ID for this Plan ID." },
          { status: 502 },
        );
      }
      resolvedServiceTypeId = parsedId;
    }

    const itemsUrl = `https://api.planningcenteronline.com/services/v2/service_types/${resolvedServiceTypeId}/plans/${planId}/items?include=song`;
    const itemsResp = await pcoGetJson(itemsUrl, auth);
    if (!itemsResp.res.ok) {
      if (itemsResp.parsed.kind === "json") {
        return NextResponse.json(
          { ok: false, error: formatPcoError(itemsResp.res.status, itemsResp.parsed.json) },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { ok: false, error: `Planning Center request failed (${itemsResp.res.status})` },
        { status: 502 },
      );
    }

    const itemsJson =
      itemsResp.parsed.kind === "json"
        ? (itemsResp.parsed.json as { data?: PcoItem[] })
        : {};
    const items = Array.isArray(itemsJson.data) ? itemsJson.data : [];
    const orderedSongItems = items.toSorted(orderBySequence).filter(isSongItem);

    const results: SongScanResult[] = [];
    for (const item of orderedSongItems) {
      const songTitle = item.attributes?.title?.trim() || "(Untitled)";
      const songId = item.relationships?.song?.data?.id;
      if (!songId) {
        results.push({ songTitle, tier: "red", message: "no song scan found" });
        continue;
      }

      const attachments = await listSongAttachments(songId, auth);

      const green = attachments.find((a) => isGreen(attachmentName(a)));
      if (green) {
        const url = attachmentUrl(green);
        results.push({
          songTitle,
          tier: "green",
          message: attachmentName(green) || "(Resources) Song Scan MASTER",
          url: url || undefined,
        });
        continue;
      }

      const yellowMatches = attachments.filter((a) => isYellow(attachmentName(a)));
      if (yellowMatches.length > 0) {
        const first = yellowMatches[0];
        const url = attachmentUrl(first);
        const count = yellowMatches.length;
        results.push({
          songTitle,
          tier: "yellow",
          message: `${attachmentName(first) || "song scan"}${count > 1 ? ` (+${count})` : ""}`,
          url: url || undefined,
          matchCount: count,
        });
        continue;
      }

      results.push({ songTitle, tier: "red", message: "no song scan found" });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

