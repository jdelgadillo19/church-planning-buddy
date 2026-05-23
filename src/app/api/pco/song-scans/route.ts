import { NextResponse } from "next/server";
import {
  attachmentName,
  classifyAttachmentTier,
  listSongAttachments,
  pickBestScanAttachment,
} from "@/lib/pco/scans";

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
    arrangement?: {
      data?: { id: string; type: string } | null;
    };
  };
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

      const arrangementId = item.relationships?.arrangement?.data?.id ?? null;
      const attachments = await listSongAttachments(songId, auth, arrangementId);
      const pick = pickBestScanAttachment(attachments, arrangementId);

      if (!pick) {
        results.push({ songTitle, tier: "red", message: "no song scan found" });
        continue;
      }

      const yellowCount = attachments.filter(
        (a) => classifyAttachmentTier(attachmentName(a)) === "yellow",
      ).length;

      results.push({
        songTitle,
        tier: pick.tier,
        message:
          pick.name ||
          (pick.tier === "green" ? "(Resources) Song Scan MASTER" : "song scan"),
        url: pick.url || undefined,
        matchCount: pick.tier === "yellow" && yellowCount > 1 ? yellowCount : undefined,
      });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

