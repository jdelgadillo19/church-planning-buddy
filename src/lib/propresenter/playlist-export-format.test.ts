import assert from "node:assert/strict";
import { isZipArchive, validateNativePlaylistExport } from "./playlist-export-format";

const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.equal(isZipArchive(zipHeader), true);

const protobufLike = Buffer.alloc(200, 0);
protobufLike.write("SUN 2026.06.07", 10, "utf8");
assert.equal(isZipArchive(protobufLike), false);

validateNativePlaylistExport(protobufLike, "SUN 2026.06.07");

let threw = false;
try {
  validateNativePlaylistExport(Buffer.alloc(200, 0x41), "Missing");
} catch {
  threw = true;
}
assert.equal(threw, true, "missing playlist name should fail");

console.log("playlist-export-format.test.ts: ok");
