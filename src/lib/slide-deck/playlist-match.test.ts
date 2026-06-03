import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import {
  comparePlaylistToExpected,
  expectedNamesFromCommitPlan,
  normalizePlaylistItemName,
} from "./playlist-match";
import type { MockCommitPlan } from "./mock-commit";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function item(name: string, index: number): PpPlaylistItemRef {
  return { id: `id-${index}`, name, index };
}

{
  const norm = normalizePlaylistItemName("Holy Forever (EN)");
  assert(norm === "holy forever", `paren strip, got ${norm}`);
}

{
  const expected = ["WELCOME-Sundays", "Song A"];
  const actual = [item("WELCOME-Sundays", 0), item("Song A", 1)];
  const result = comparePlaylistToExpected(expected, actual);
  assert(result.matched, `exact match failed: ${result.differences.join("; ")}`);
}

{
  const expected = ["A", "B"];
  const actual = [item("B", 0), item("A", 1)];
  const result = comparePlaylistToExpected(expected, actual);
  assert(!result.matched, "wrong order should fail");
  assert(result.differences.some((d) => d.includes("Position 1")), "should cite position");
}

{
  const expected = ["A", "B", "C"];
  const actual = [item("A", 0), item("B", 1)];
  const result = comparePlaylistToExpected(expected, actual);
  assert(!result.matched, "missing item should fail");
  assert(result.differences.some((d) => d.includes("count") || d.includes("missing")), "count or missing");
}

{
  const expected = ["A"];
  const actual = [item("A", 0), item("Extra", 1)];
  const result = comparePlaylistToExpected(expected, actual);
  assert(!result.matched, "extra item should fail");
}

{
  const expected = ["Holy Forever"];
  const actual = [item("Holy Forever (EN)", 0), item("Holy Forever DE", 1)];
  const result = comparePlaylistToExpected(expected, actual);
  assert(!result.matched, "single expected vs two actual should fail count");
}

{
  const plan = {
    playlistPreview: [
      { position: 1, name: "Intro", kind: "template_inherit" as const, source: "" },
      { position: 2, name: "Song", kind: "song_add" as const, source: "" },
    ],
  } as MockCommitPlan;
  const names = expectedNamesFromCommitPlan(plan);
  assert(names.length === 2 && names[0] === "Intro", "expectedNamesFromCommitPlan");
}

console.log("playlist-match tests ok");
