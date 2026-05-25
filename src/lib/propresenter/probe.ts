import { loadProPresenterConfig, proPresenterBaseUrl } from "./config";
import { ppRequest, ProPresenterApiError } from "./client";
import type { PpJson, PpProbeReport, PpProbeStep } from "./types";

const MAX_SAMPLE_ITEMS = 3;
const MAX_SAMPLE_JSON_CHARS = 4000;

function truncateSample(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json.length <= MAX_SAMPLE_JSON_CHARS) return value;
  return { _truncated: true, preview: json.slice(0, MAX_SAMPLE_JSON_CHARS) + "…" };
}

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as PpJson;
    for (const key of ["items", "data", "presentations", "libraries", "playlists"]) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}

function firstId(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const o = item as PpJson;
  const id = o.id ?? o.uuid ?? o.presentation_id ?? o.playlist_id;
  return typeof id === "string" ? id : typeof id === "number" ? String(id) : undefined;
}

function collectObjectKeys(value: unknown, depth = 0, maxDepth = 4): string[] {
  const keys = new Set<string>();
  if (!value || typeof value !== "object" || depth > maxDepth) return [];
  if (Array.isArray(value)) {
    for (const el of value.slice(0, 2)) {
      for (const k of collectObjectKeys(el, depth + 1, maxDepth)) keys.add(k);
    }
    return [...keys].sort();
  }
  const o = value as PpJson;
  for (const [k, v] of Object.entries(o)) {
    keys.add(k);
    if (/arrangement|group|cue|slide|tile|lyric/i.test(k)) {
      for (const sub of collectObjectKeys(v, depth + 1, maxDepth)) keys.add(`${k}.${sub}`);
    }
  }
  return [...keys].sort();
}

async function runStep(
  name: string,
  method: string,
  path: string,
  run: () => Promise<{ summary?: string; sample?: unknown; notes?: string }>,
): Promise<PpProbeStep> {
  try {
    const out = await run();
    return { name, ok: true, method, path, summary: out.summary, sample: out.sample, notes: out.notes };
  } catch (e) {
    const err = e instanceof ProPresenterApiError ? e : new Error(String(e));
    return {
      name,
      ok: false,
      method,
      path,
      summary: err.message,
      notes: e instanceof ProPresenterApiError ? `HTTP ${e.status ?? "—"}` : undefined,
    };
  }
}

export type RunProbeOptions = {
  /** Optional presentation UUID to fetch (skips library scan for id). */
  presentationUuid?: string;
  config?: ReturnType<typeof loadProPresenterConfig>;
};

/**
 * Read-only Local API probe for Phase 0 spike documentation.
 * Safe to run against production library (GET only).
 */
export async function runProPresenterProbe(
  options: RunProbeOptions = {},
): Promise<PpProbeReport> {
  const config = options.config ?? loadProPresenterConfig();
  const baseUrl = proPresenterBaseUrl(config);
  const steps: PpProbeStep[] = [];
  let presentationShape: string[] | undefined;
  let connected = false;
  let topError: string | undefined;

  const librariesStep = await runStep("libraries", "GET", "v1/libraries", async () => {
    const { data } = await ppRequest("v1/libraries", { config });
    const list = asArray(data);
    connected = true;
    return {
      summary: `${list.length} librar${list.length === 1 ? "y" : "ies"}`,
      sample: truncateSample(list.slice(0, MAX_SAMPLE_ITEMS)),
    };
  });
  steps.push(librariesStep);

  if (!librariesStep.ok) {
    topError = librariesStep.summary;
    return { connected: false, baseUrl, allowWrites: config.allowWrites, error: topError, steps };
  }

  const libs = asArray(
    (await ppRequest("v1/libraries", { config })).data,
  );
  const libraryId = firstId(libs[0]);

  if (libraryId) {
    steps.push(
      await runStep("library_items", "GET", `v1/library/${libraryId}`, async () => {
        const { data } = await ppRequest(`v1/library/${libraryId}`, { config });
        const items = asArray(data);
        return {
          summary: `${items.length} item(s) in library ${libraryId}`,
          sample: truncateSample(items.slice(0, MAX_SAMPLE_ITEMS)),
          notes: "Inspect sample for presentation id/uuid and arrangement-related fields.",
        };
      }),
    );
  }

  steps.push(
    await runStep("playlists", "GET", "v1/playlists", async () => {
      const { data } = await ppRequest("v1/playlists", { config });
      const list = asArray(data);
      return {
        summary: `${list.length} playlist root(s)`,
        sample: truncateSample(list.slice(0, MAX_SAMPLE_ITEMS)),
      };
    }),
  );

  let presentationUuid = options.presentationUuid?.trim();
  if (!presentationUuid && libraryId) {
    try {
      const { data } = await ppRequest(`v1/library/${libraryId}`, { config });
      const items = asArray(data);
      presentationUuid = items.map(firstId).find(Boolean);
    } catch {
      /* optional */
    }
  }

  if (presentationUuid) {
    const presStep = await runStep(
      "presentation_detail",
      "GET",
      `v1/presentation/${presentationUuid}`,
      async () => {
        const { data } = await ppRequest(`v1/presentation/${presentationUuid}`, { config });
        presentationShape = collectObjectKeys(data);
        const arrangements = findArrangementHints(data);
        return {
          summary: `Presentation ${presentationUuid}; shape keys: ${presentationShape.length}`,
          sample: truncateSample(data),
          notes: arrangements.length
            ? `Arrangement-related paths: ${arrangements.join(", ")}`
            : "No obvious arrangement keys in top-level scan — check nested groups/cues in sample.",
        };
      },
    );
    steps.push(presStep);
  } else {
    steps.push({
      name: "presentation_detail",
      ok: false,
      method: "GET",
      path: "v1/presentation/{uuid}",
      summary: "Skipped — no presentation uuid (pass presentationUuid in probe body).",
    });
  }

  steps.push({
    name: "arrangement_api_docs",
    ok: true,
    method: "—",
    path: "openapi.propresenter.com",
    summary: "No documented arrangement select/duplicate/reorder endpoints in public OpenAPI.",
    notes:
      "Verified: POST v1/playlists, GET v1/library/{id}, GET v1/presentation/{uuid}. " +
      "Tile reorder not in spec — confirm via presentation_detail sample groups/cues.",
  });

  return {
    connected,
    baseUrl,
    allowWrites: config.allowWrites,
    error: topError,
    steps,
    presentationShape,
  };
}

function findArrangementHints(data: unknown, prefix = ""): string[] {
  const hits: string[] = [];
  if (!data || typeof data !== "object") return hits;
  if (Array.isArray(data)) {
    for (const el of data.slice(0, 5)) hits.push(...findArrangementHints(el, prefix));
    return hits;
  }
  const o = data as PpJson;
  for (const [k, v] of Object.entries(o)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (/arrangement|arrangements|group|groups|cue|cues|tile|tiles|lyric/i.test(k)) {
      hits.push(path);
    }
    if (typeof v === "object" && v !== null && hits.length < 40) {
      hits.push(...findArrangementHints(v, path));
    }
  }
  return [...new Set(hits)].slice(0, 25);
}
