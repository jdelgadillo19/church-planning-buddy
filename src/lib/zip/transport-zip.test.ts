import assert from "node:assert/strict";
import { buildTransportZip } from "./transport-zip";

async function main() {
  const zip = await buildTransportZip({
    entryName: "Test.proplaylist",
    fileBytes: Buffer.from("export-payload-with-SUN 2026.06.07"),
  });

  assert(zip.length > 50, "zip has content");
  assert(zip[0] === 0x50 && zip[1] === 0x4b, "PK header");
  console.log("transport-zip.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
