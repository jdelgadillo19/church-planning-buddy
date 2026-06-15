import type { docs_v1 } from "@/lib/google/api-types";
import type { GoogleTokens } from "@/app/api/auth/google/_session";
import { resolveGoogleAccessToken } from "@/lib/google/drive-fetch";

const DOCS_API = "https://docs.googleapis.com/v1/documents";

/** Google Docs API allows at most 50 requests per batchUpdate call. */
export const DOCS_BATCH_LIMIT = 50;

export function chunkDocsRequests<T>(requests: T[], size = DOCS_BATCH_LIMIT): T[][] {
  if (requests.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < requests.length; i += size) {
    chunks.push(requests.slice(i, i + size));
  }
  return chunks;
}

export async function docsBatchUpdateChunked(
  accessToken: string,
  documentId: string,
  requests: docs_v1.Schema$Request[],
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const chunks = chunkDocsRequests(requests);
  if (chunks.length === 0) {
    return {};
  }
  let last: docs_v1.Schema$BatchUpdateDocumentResponse = {};
  for (const chunk of chunks) {
    last = await docsBatchUpdateFetch(accessToken, documentId, chunk);
  }
  return last;
}

export async function fetchGoogleDocument(
  accessToken: string,
  documentId: string,
): Promise<docs_v1.Schema$Document> {
  const url = `${DOCS_API}/${encodeURIComponent(documentId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Google Docs API ${res.status}: could not read document${documentId ? ` (${documentId})` : ""}.${detail ? ` ${detail.slice(0, 120)}` : ""}`,
    );
  }

  const doc = (await res.json()) as docs_v1.Schema$Document;
  if (!doc.body) {
    throw new Error("Could not load document content.");
  }
  return doc;
}

export async function fetchGoogleDocumentForTokens(
  tokens: GoogleTokens,
  documentId: string,
): Promise<docs_v1.Schema$Document> {
  const accessToken = await resolveGoogleAccessToken(tokens);
  if (!accessToken) throw new Error("Google access token unavailable.");
  return fetchGoogleDocument(accessToken, documentId);
}

export async function docsBatchUpdateFetch(
  accessToken: string,
  documentId: string,
  requests: docs_v1.Schema$Request[],
): Promise<docs_v1.Schema$BatchUpdateDocumentResponse> {
  const url = `${DOCS_API}/${encodeURIComponent(documentId)}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google Docs batchUpdate ${res.status}: ${detail.slice(0, 200)}`);
  }

  return (await res.json()) as docs_v1.Schema$BatchUpdateDocumentResponse;
}

/** Workers-safe Docs client shim (get + batchUpdate via fetch). */
export function createFetchDocsClient(tokens: GoogleTokens): docs_v1.Docs {
  return {
    documents: {
      get: async (params: { documentId?: string | null }) => {
        const documentId = params?.documentId;
        if (!documentId) throw new Error("documentId required");
        const data = await fetchGoogleDocumentForTokens(tokens, documentId);
        return { data };
      },
      batchUpdate: async (params: {
        documentId?: string | null;
        requestBody?: { requests?: docs_v1.Schema$Request[] | null };
      }) => {
        const documentId = params?.documentId;
        const requests = params?.requestBody?.requests ?? [];
        if (!documentId) throw new Error("documentId required");
        const accessToken = await resolveGoogleAccessToken(tokens);
        if (!accessToken) throw new Error("Google access token unavailable.");
        const data = await docsBatchUpdateChunked(accessToken, documentId, requests);
        return { data };
      },
    },
  } as unknown as docs_v1.Docs;
}
