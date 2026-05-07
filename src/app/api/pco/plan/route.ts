import { NextResponse } from "next/server";

type PlanRequestBody = {
  serviceTypeId: string;
  planId: string;
  outputMode: "full" | "songs";
};

type PlanResponseOk = {
  ok: true;
  songOrderText: string;
  lines: string[];
  outputMode: "full" | "songs";
};

type PcoErrorPayload = {
  errors?: Array<{
    title?: string;
    detail?: string;
    code?: string;
  }>;
};

type PcoPlan = {
  id: string;
  relationships?: {
    service_type?: {
      data?: {
        id?: string;
      };
    };
  };
};

type PcoItem = {
  id: string;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<PlanRequestBody>;
    const serviceTypeId = parsePositiveIntOrNull(body.serviceTypeId);
    const planId = parsePositiveIntOrNull(body.planId);
    const outputMode: "full" | "songs" = body.outputMode === "songs" ? "songs" : "full";

    if (!planId) {
      return NextResponse.json(
        { ok: false, error: "Please provide a numeric Plan ID." },
        { status: 400 },
      );
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
          const base = formatPcoError(planResp.res.status, planResp.parsed.json);
          const hint =
            planResp.res.status === 401
              ? " Check `.env.local` has `PCO_BASIC_TOKEN=APPLICATION_ID:SECRET` (no extra spaces/quotes) and restart `npm run dev`."
              : "";
          return NextResponse.json({ ok: false, error: `${base}${hint}` }, { status: 502 });
        }
        const snippet = planResp.parsed.text.trim().slice(0, 200);
        return NextResponse.json(
          {
            ok: false,
            error: `Planning Center request failed (${planResp.res.status})${
              snippet ? ` — ${snippet}` : ""
            }`,
          },
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

    // include=song ensures relationship + included payload are present when linked
    const url = `https://api.planningcenteronline.com/services/v2/service_types/${resolvedServiceTypeId}/plans/${planId}/items?include=song`;
    const itemsResp = await pcoGetJson(url, auth);

    const parsed = itemsResp.parsed;

    if (!itemsResp.res.ok) {
      if (parsed.kind === "json") {
        const base = formatPcoError(itemsResp.res.status, parsed.json);
        const hint =
          itemsResp.res.status === 401
            ? " Check `.env.local` has `PCO_BASIC_TOKEN=APPLICATION_ID:SECRET` (no extra spaces/quotes) and restart `npm run dev`."
            : "";
        return NextResponse.json(
          { ok: false, error: `${base}${hint}` },
          { status: 502 },
        );
      }
      const snippet = parsed.text.trim().slice(0, 200);
      return NextResponse.json(
        {
          ok: false,
          error: `Planning Center request failed (${itemsResp.res.status})${
            snippet ? ` — ${snippet}` : ""
          }`,
        },
        { status: 502 },
      );
    }

    const json = parsed.kind === "json" ? (parsed.json as { data?: PcoItem[] }) : {};

    const items = Array.isArray(json.data) ? json.data : [];

    const orderedItems = items.toSorted((a, b) => {
      const sa = a.attributes?.sequence ?? a.attributes?.position ?? 0;
      const sb = b.attributes?.sequence ?? b.attributes?.position ?? 0;
      return sa - sb;
    });

    const filtered =
      outputMode === "songs"
        ? orderedItems.filter((item) => {
            const t = item.attributes?.item_type ?? "";
            if (t.toLowerCase() === "song") return true;
            return Boolean(item.relationships?.song?.data);
          })
        : orderedItems;

    const lines = filtered
      .map((item) => item.attributes?.title)
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0);

    const songOrderText =
      lines.length > 0
        ? lines.join("\n")
        : outputMode === "songs"
          ? "(No songs found on this plan.)"
          : "(No plan items found.)";

    const payload: PlanResponseOk = { ok: true, songOrderText, lines, outputMode };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

