import net from "node:net";
import type { ProPresenterConfig } from "./config";
import { proPresenterBaseUrl } from "./config";
import { ProPresenterApiError } from "./client";
import type { PpJson } from "./types";

/**
 * ProPresenter TCP/IP API — one JSON object per line, CRLF-terminated.
 * Same endpoints as HTTP; used when HTTP is unavailable on some rigs.
 */
export async function ppTcpRequest<T = PpJson>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    config: ProPresenterConfig;
  },
): Promise<{ status: number; data: T }> {
  const config = options?.config;
  if (!config) throw new Error("ppTcpRequest requires config");

  const rel = path.replace(/^\//, "");
  const method = (options?.method ?? "GET").toUpperCase();
  const payload: Record<string, unknown> = { url: rel, method };
  if (options?.body !== undefined) payload.body = options.body;

  const line = `${JSON.stringify(payload)}\r\n`;

  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: config.host, port: config.port });
    let buf = "";
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(
        new ProPresenterApiError(message, {
          path: rel,
        }),
      );
    };

    socket.setTimeout(config.requestTimeoutMs);
    socket.on("connect", () => socket.write(line));
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const raw = buf.slice(0, nl).trim();
      settled = true;
      socket.destroy();
      try {
        const parsed = JSON.parse(raw) as {
          url?: string;
          data?: T;
          error?: string;
        };
        if (parsed.error) {
          reject(
            new ProPresenterApiError(parsed.error, {
              path: rel,
              body: parsed,
            }),
          );
          return;
        }
        resolve({ status: 200, data: (parsed.data ?? {}) as T });
      } catch {
        reject(
          new ProPresenterApiError(`Invalid TCP response: ${raw.slice(0, 200)}`, {
            path: rel,
          }),
        );
      }
    });
    socket.on("timeout", () =>
      fail(
        `TCP timeout to ${proPresenterBaseUrl(config).replace(/^http/, "tcp")} — is Enable Network on?`,
      ),
    );
    socket.on("error", (e) => fail(e.message));
    socket.on("close", () => {
      if (!settled) fail("TCP closed without response");
    });
  });
}
