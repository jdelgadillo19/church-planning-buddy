export type PpTransport = "http" | "tcp" | "auto";

export type ProPresenterConfig = {
  host: string;
  /** Primary port — for `tcp` / `auto` this is usually the TCP/IP Port ID. */
  port: number;
  /** Optional Network-tab port (often HTTP/WebSocket). Used by diagnose when set. */
  networkPort?: number;
  https: boolean;
  requestTimeoutMs: number;
  allowWrites: boolean;
  transport: PpTransport;
};

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid PP_PORT: ${raw}`);
  }
  return n;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  throw new Error(`Invalid boolean env value: ${raw}`);
}

/** ProPresenter Local API connection settings (server-side only). */
export function loadProPresenterConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProPresenterConfig {
  const transportRaw = env.PP_TRANSPORT?.trim().toLowerCase();
  const transport: PpTransport =
    transportRaw === "tcp" || transportRaw === "http" || transportRaw === "auto"
      ? transportRaw
      : "auto";

  const port = parsePort(env.PP_PORT, 50001);
  const networkPortRaw = env.PP_NETWORK_PORT?.trim();
  const networkPort = networkPortRaw ? parsePort(networkPortRaw, port) : undefined;

  return {
    host: env.PP_HOST?.trim() || "127.0.0.1",
    port,
    networkPort: networkPort !== port ? networkPort : undefined,
    https: parseBool(env.PP_HTTPS, false),
    requestTimeoutMs: parsePort(env.PP_REQUEST_TIMEOUT_MS, 10_000),
    allowWrites: parseBool(env.PP_ALLOW_WRITES, false),
    transport,
  };
}

export function proPresenterBaseUrl(config: ProPresenterConfig): string {
  const scheme = config.https ? "https" : "http";
  return `${scheme}://${config.host}:${config.port}`;
}
