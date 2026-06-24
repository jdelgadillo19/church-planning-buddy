import { sanitizeErrorMessage, looksLikeBinaryPayload } from "./sanitize-error-message";

export async function readJsonOrText(res: Response) {
  const text = await res.text();
  try {
    return { kind: "json" as const, json: JSON.parse(text) as unknown, text };
  } catch {
    return { kind: "text" as const, text };
  }
}

/** Safe API error message — never surface raw binary bodies. */
export function formatApiErrorBody(status: number, parsed: Awaited<ReturnType<typeof readJsonOrText>>) {
  if (parsed.kind === "json") {
    const payload = parsed.json as { error?: string; message?: string };
    return sanitizeErrorMessage(
      payload.error ?? payload.message ?? `Request failed (${status}).`,
    );
  }
  const snippet = parsed.text.trim().slice(0, 200);
  if (looksLikeBinaryPayload(snippet)) {
    return `Request failed (${status}). Hard-refresh and try again.`;
  }
  const printable = snippet && /^[\x20-\x7e]+$/.test(snippet);
  return printable
    ? sanitizeErrorMessage(`Request failed (${status}) — ${snippet}`)
    : `Request failed (${status}).`;
}
