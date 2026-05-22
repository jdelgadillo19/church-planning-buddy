export type PcoErrorPayload = {
  errors?: Array<{ title?: string; detail?: string; code?: string }>;
};

export function buildAuthHeader() {
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

export function parsePositiveIntOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

async function readJsonOrText(res: Response) {
  const text = await res.text();
  try {
    return { kind: "json" as const, json: JSON.parse(text), text };
  } catch {
    return { kind: "text" as const, text };
  }
}

export function formatPcoError(status: number, data: unknown) {
  const payload = data as PcoErrorPayload;
  const first = payload?.errors?.[0];
  const bits = [first?.title, first?.detail, first?.code ? `code: ${first.code}` : null].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const suffix = bits.length > 0 ? ` — ${bits.join(" | ")}` : "";
  return `Planning Center request failed (${status})${suffix}`;
}

export async function pcoGetJson(url: string, auth: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: auth, accept: "application/json" },
    cache: "no-store",
  });
  const parsed = await readJsonOrText(res);
  return { res, parsed };
}

export async function pcoGetJsonOrThrow(url: string, auth: string) {
  const { res, parsed } = await pcoGetJson(url, auth);
  if (!res.ok) {
    if (parsed.kind === "json") throw new Error(formatPcoError(res.status, parsed.json));
    throw new Error(`Planning Center request failed (${res.status})`);
  }
  if (parsed.kind !== "json") throw new Error("Planning Center returned non-JSON");
  return parsed.json;
}
