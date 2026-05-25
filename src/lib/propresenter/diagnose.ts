import net from "node:net";
import {
  loadProPresenterConfig,
  proPresenterBaseUrl,
  type ProPresenterConfig,
} from "./config";

export type DiagnoseLine = {
  test: string;
  ok: boolean;
  detail: string;
};

export type DiagnoseReport = {
  host: string;
  port: number;
  httpBaseUrl: string;
  httpsBaseUrl: string;
  lines: DiagnoseLine[];
  hints: string[];
};

function push(lines: DiagnoseLine[], test: string, ok: boolean, detail: string) {
  lines.push({ test, ok, detail });
}

async function tryHttpGet(url: string, timeoutMs: number): Promise<DiagnoseLine> {
  const test = `HTTP GET ${url}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const text = (await res.text()).slice(0, 240);
    return {
      test,
      ok: res.ok,
      detail: res.ok ? `status ${res.status}, body starts: ${text}` : `status ${res.status}: ${text}`,
    };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const cause = err.cause;
    const code = cause?.code ?? (err as NodeJS.ErrnoException).code;
    const bit = [err.message, cause?.message, code].filter(Boolean).join(" | ");
    return { test, ok: false, detail: bit || String(e) };
  }
}

function tryTcpLibraries(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<DiagnoseLine> {
  const test = `TCP JSON {"url":"v1/libraries"} → ${host}:${port}`;
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    let buf = "";

    const finish = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ test, ok, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      const line = `${JSON.stringify({ url: "v1/libraries" })}\r\n`;
      socket.write(line);
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes("\n") || buf.length > 8000) finish(true, buf.trim().slice(0, 400));
    });
    socket.on("timeout", () => finish(false, "TCP timeout (no response line)"));
    socket.on("error", (e) => finish(false, e.message));
    socket.on("close", () => {
      if (!settled) {
        finish(
          buf.length > 0 && (buf.includes('"data"') || buf.includes("libraries")),
          buf.trim() ? buf.trim().slice(0, 400) : "TCP closed with no data (port may be closed)",
        );
      }
    });
  });
}

export function diagnoseHints(lines: DiagnoseLine[], config: ProPresenterConfig): string[] {
  const hints: string[] = [];
  const allConnRefused = lines.every(
    (l) => !l.ok && /ECONNREFUSED|Failed to connect|connection refused/i.test(l.detail),
  );

  if (allConnRefused) {
    hints.push(
      "Nothing is listening on this port. In ProPresenter → Settings → Network: turn **Enable Network** ON, then note the **Port** (not a separate “TCP-only” port).",
    );
    hints.push(
      "With ProPresenter **open**, run: `lsof -nP -iTCP:" +
        config.port +
        " -sTCP:LISTEN` — you should see ProPresenter. If empty, the API is not bound.",
    );
    hints.push("Toggle **Enable Network** off and on (known workaround on some Mac/PP versions).");
    hints.push("Try **API Documentation** in Network — if the in-app doc page fails to load, HTTP API is not running.");
  }

  const httpOk = lines.some((l) => l.ok && l.test.startsWith("HTTP GET http"));
  const tcpOk = lines.some((l) => l.ok && l.test.startsWith("TCP JSON"));
  const httpInvalidProtocol = lines.some(
    (l) =>
      !l.ok &&
      l.test.startsWith("HTTP GET http") &&
      /HPE_INVALID|does not match the HTTP/i.test(l.detail),
  );
  if (httpInvalidProtocol && tcpOk) {
    hints.push(
      "Port " +
        config.port +
        " speaks **TCP JSON only** (not HTTP). Set `PP_TRANSPORT=tcp` and keep `PP_PORT` as the TCP/IP Port ID.",
    );
  } else if (tcpOk && !httpOk) {
    hints.push("TCP works but HTTP failed — set `PP_TRANSPORT=tcp` in `.env.local`.");
  }

  if (config.networkPort) {
    hints.push(
      "Also testing PP_NETWORK_PORT=" +
        config.networkPort +
        " (Network tab). Use that port for HTTP only if diagnose shows HTTP ✓ there.",
    );
  } else if (httpInvalidProtocol) {
    hints.push(
      "If Network settings show a **different Port** (e.g. 64496), add `PP_NETWORK_PORT=64496` and re-run diagnose.",
    );
  }

  return hints;
}

export async function runProPresenterDiagnose(
  config = loadProPresenterConfig(),
): Promise<DiagnoseReport> {
  const httpBase = proPresenterBaseUrl(config);
  const httpsBase = `https://${config.host}:${config.port}`;
  const timeoutMs = Math.min(config.requestTimeoutMs, 8000);
  const lines: DiagnoseLine[] = [];

  lines.push(await tryHttpGet(`${httpBase}/v1/libraries`, timeoutMs));
  lines.push(await tryHttpGet(`${httpsBase}/v1/libraries`, timeoutMs));
  lines.push(await tryTcpLibraries(config.host, config.port, timeoutMs));

  if (config.networkPort) {
    const netHttp = `http://${config.host}:${config.networkPort}`;
    lines.push(await tryHttpGet(`${netHttp}/v1/libraries`, timeoutMs));
    lines.push(await tryTcpLibraries(config.host, config.networkPort, timeoutMs));
  }

  return {
    host: config.host,
    port: config.port,
    httpBaseUrl: httpBase,
    httpsBaseUrl: httpsBase,
    lines,
    hints: diagnoseHints(lines, config),
  };
}
