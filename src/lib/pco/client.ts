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

export async function pcoPostJson(url: string, auth: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: auth,
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const parsed = await readJsonOrText(res);
  return { res, parsed };
}

export async function pcoPostJsonOrThrow(url: string, auth: string, body?: unknown) {
  const { res, parsed } = await pcoPostJson(url, auth, body);
  if (!res.ok) {
    if (parsed.kind === "json") throw new Error(formatPcoError(res.status, parsed.json));
    throw new Error(`Planning Center request failed (${res.status})`);
  }
  if (parsed.kind !== "json") throw new Error("Planning Center returned non-JSON");
  return parsed.json;
}

export async function pcoDelete(url: string, auth: string) {
  const res = await fetch(url, {
    method: "DELETE",
    headers: { authorization: auth, accept: "application/json" },
    cache: "no-store",
  });
  const parsed = await readJsonOrText(res);
  return { res, parsed };
}

export async function pcoDeleteOrThrow(url: string, auth: string) {
  const { res, parsed } = await pcoDelete(url, auth);
  if (!res.ok && res.status !== 404) {
    if (parsed.kind === "json") throw new Error(formatPcoError(res.status, parsed.json));
    throw new Error(`Planning Center request failed (${res.status})`);
  }
}

/** Upload binary to PCO file service; returns file UUID for attachment create. */
export async function pcoUploadFile(auth: string, buffer: Buffer, filename: string): Promise<string> {
  const boundary = `----cpb${Date.now().toString(16)}`;
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, '\\"')}"\r\nContent-Type: application/pdf\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([preamble, buffer, closing]);

  const res = await fetch("https://upload.planningcenteronline.com/v2/files", {
    method: "POST",
    headers: {
      authorization: auth,
      accept: "application/json",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
    cache: "no-store",
  });

  const parsed = await readJsonOrText(res);
  if (!res.ok) {
    if (parsed.kind === "json") throw new Error(formatPcoError(res.status, parsed.json));
    throw new Error(`Planning Center file upload failed (${res.status})`);
  }
  if (parsed.kind !== "json") throw new Error("Planning Center file upload returned non-JSON");

  const data = (parsed.json as { data?: Array<{ id?: string }> }).data;
  const id = Array.isArray(data) ? data[0]?.id : undefined;
  if (!id?.trim()) throw new Error("Planning Center file upload did not return a file id.");
  return id.trim();
}
