/** Read config from Cloudflare Worker bindings with process.env fallback (local dev). */
export type EnvSource = Partial<Record<string, string | undefined>>;

export function envString(source: EnvSource | undefined, key: string): string | undefined {
  const raw = source?.[key] ?? process.env[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export async function loadWorkerEnv(): Promise<EnvSource> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as EnvSource;
  } catch {
    return process.env as EnvSource;
  }
}
