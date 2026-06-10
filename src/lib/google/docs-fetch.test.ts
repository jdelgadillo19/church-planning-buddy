import {
  chunkDocsRequests,
  DOCS_BATCH_LIMIT,
} from "./docs-fetch";

{
  const empty = chunkDocsRequests([]);
  if (empty.length !== 0) throw new Error("empty input should yield no chunks");
}

{
  const fifty = Array.from({ length: 50 }, (_, i) => ({ n: i }));
  const oneChunk = chunkDocsRequests(fifty);
  if (oneChunk.length !== 1 || oneChunk[0]!.length !== 50) {
    throw new Error("expected single chunk of 50");
  }
}

{
  const fiftyOne = Array.from({ length: 51 }, (_, i) => ({ n: i }));
  const chunks = chunkDocsRequests(fiftyOne);
  if (chunks.length !== 2 || chunks[0]!.length !== 50 || chunks[1]!.length !== 1) {
    throw new Error(`expected [50,1] chunks, got ${chunks.map((c) => c.length).join(",")}`);
  }
}

if (DOCS_BATCH_LIMIT !== 50) {
  throw new Error(`DOCS_BATCH_LIMIT should be 50, got ${DOCS_BATCH_LIMIT}`);
}

console.log("docs-fetch tests ok");
