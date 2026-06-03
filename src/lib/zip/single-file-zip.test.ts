import assert from "node:assert/strict";
import { zipSingleFile } from "./single-file-zip";

const zip = zipSingleFile("test.proplaylist", Buffer.from("playlist-bytes"));
assert(zip.length > 30, "zip has content");
assert(zip.readUInt32LE(0) === 0x04034b50, "local file header signature");

// Node zlib unzipSync only handles gzip/deflate/br — use manual parse for store zip
const nameLen = zip.readUInt16LE(26);
const dataStart = 30 + nameLen;
const entryName = zip.subarray(30, dataStart).toString("utf8");
const compSize = zip.readUInt32LE(18);
const payload = zip.subarray(dataStart, dataStart + compSize);

assert.equal(entryName, "test.proplaylist");
assert.equal(payload.toString("utf8"), "playlist-bytes");

console.log("single-file-zip.test.ts: ok");
