import {
  loadProPresenterConfig,
  proPresenterBaseUrl,
  type ProPresenterConfig,
} from "./config";
import { assertPpRequestAllowed } from "./safety";
import { ppTcpRequest } from "./tcp-transport";
import type { PpJson } from "./types";

export class ProPresenterApiError extends Error {
  readonly status?: number;
  readonly path?: string;
  readonly body?: unknown;

  constructor(message: string, opts?: { status?: number; path?: string; body?: unknown }) {
    super(message);
    this.name = "ProPresenterApiError";
    this.status = opts?.status;
    this.path = opts?.path;
    this.body = opts?.body;
  }
}

export function isProPresenterApiError(
  e: unknown,
): e is ProPresenterApiError {
  return (
    e instanceof ProPresenterApiError ||
    (typeof e === "object" &&
      e !== null &&
      (e as ProPresenterApiError).name === "ProPresenterApiError")
  );
}

export type PpRequestResult<T = PpJson> = {
  ok: true;
  status: number;
  data: T;
};

function connectionHint(config: ProPresenterConfig, detail?: string): string {
  const extra = detail ? ` (${detail})` : "";
  const base = `Cannot reach ProPresenter at ${proPresenterBaseUrl(config)}${extra}.`;
  if (process.env.RIG_ID?.trim()) {
    return (
      `${base} Open ProPresenter on this Mac with Settings → Network → Enable Network ON. ` +
      `In Grapevine Rig, set ProPresenter port to the TCP/IP Port ID shown there ` +
      `(transport: TCP for ProPresenter 21+). Toggle Network off/on if the port still refuses connections.`
    );
  }
  return (
    `${base} ProPresenter → Settings → Network: **Enable Network** ON, use the Port shown there as PP_PORT. ` +
    "Run `npm run pp:diagnose` while ProPresenter is open. Toggle Network off/on if needed."
  );
}

export function isProPresenterConnectionError(message: string): boolean {
  return /ECONNREFUSED|fetch failed|Failed to connect|AbortError|ETIMEDOUT|TCP timeout|TCP closed|Cannot reach ProPresenter/i.test(
    message,
  );
}

function isConnectionFailure(message: string): boolean {
  return isProPresenterConnectionError(message);
}

async function ppHttpRequest<T>(
  rel: string,
  method: string,
  body: unknown | undefined,
  config: ProPresenterConfig,
): Promise<PpRequestResult<T>> {
  const url = `${proPresenterBaseUrl(config)}/${rel}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: T;
    if (!text) {
      data = {} as T;
    } else {
      try {
        data = JSON.parse(text) as T;
      } catch {
        throw new ProPresenterApiError(`Non-JSON response from ${rel}`, {
          status: res.status,
          path: rel,
          body: text.slice(0, 500),
        });
      }
    }

    if (!res.ok) {
      throw new ProPresenterApiError(`ProPresenter ${method} ${rel} failed (${res.status})`, {
        status: res.status,
        path: rel,
        body: data,
      });
    }

    return { ok: true, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function ppRequest<T = PpJson>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    config?: ProPresenterConfig;
    /** Skip safety check (tests only). */
    unsafe?: boolean;
  },
): Promise<PpRequestResult<T>> {
  const config = options?.config ?? loadProPresenterConfig();
  const method = (options?.method ?? "GET").toUpperCase();
  const rel = path.replace(/^\//, "");

  if (!options?.unsafe) {
    assertPpRequestAllowed(rel, method, config.allowWrites);
  }

  const body = options?.body;

  const tryHttp = () => ppHttpRequest<T>(rel, method, body, config);
  const tryTcp = () =>
    ppTcpRequest<T>(rel, { method, body, config }).then((r) => ({
      ok: true as const,
      status: r.status,
      data: r.data,
    }));

  try {
    if (config.transport === "tcp") return await tryTcp();
    if (config.transport === "http") return await tryHttp();
    try {
      return await tryHttp();
    } catch (httpErr) {
      if (!(httpErr instanceof ProPresenterApiError)) throw httpErr;
      const detail = httpErr.message;
      try {
        return await tryTcp();
      } catch {
        throw new ProPresenterApiError(connectionHint(config, detail), { path: rel });
      }
    }
  } catch (e) {
    if (e instanceof ProPresenterApiError) {
      if (isConnectionFailure(e.message)) {
        throw new ProPresenterApiError(connectionHint(config, e.message), {
          status: e.status,
          path: rel,
          body: e.body,
        });
      }
      throw e;
    }
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const msg = [err.message, err.cause?.message, err.cause?.code].filter(Boolean).join(" | ");
    if (isConnectionFailure(msg)) {
      throw new ProPresenterApiError(connectionHint(config, msg), { path: rel });
    }
    throw new ProPresenterApiError(msg, { path: rel });
  }
}

export async function ppPing(config?: ProPresenterConfig): Promise<{ ok: true; baseUrl: string }> {
  const cfg = config ?? loadProPresenterConfig();
  await ppRequest("v1/libraries", { config: cfg });
  return { ok: true, baseUrl: proPresenterBaseUrl(cfg) };
}
