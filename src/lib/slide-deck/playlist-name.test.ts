import assert from "node:assert/strict";
import {
  buildPlaylistNameFromPlanDate,
  parseServiceDateFromPlaylistName,
} from "./playlist-name";

assert.equal(buildPlaylistNameFromPlanDate("2026-06-14"), "SUN 2026.06.14");
assert.equal(parseServiceDateFromPlaylistName("SUN 2026.06.14"), "2026-06-14");
assert.equal(parseServiceDateFromPlaylistName("SUN 2026-06-14"), "2026-06-14");

console.log("playlist-name.test.ts ok");
