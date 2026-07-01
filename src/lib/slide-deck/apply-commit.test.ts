import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";
import { buildWriteItemsFromPreview } from "./apply-commit";
import { expectedNamesFromWriteItems } from "./playlist-match";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const baseRow = (
  overrides: Partial<MockCommitPlaylistRow> & { name: string; kind: MockCommitPlaylistRow["kind"] },
): MockCommitPlaylistRow => ({
  position: 1,
  source: "",
  ...overrides,
});

const commitPlan = {
  playlistName: "SUN 2026.06.14",
  playlistPreview: [
    baseRow({ position: 1, name: "WELCOME", kind: "template_inherit" }),
    baseRow({
      position: 2,
      name: "What A God",
      kind: "song_add",
      pcoTitle: "What A God",
      libraryMatch: { status: "not_found", note: "No match" },
    }),
    baseRow({
      position: 3,
      name: "(EN) Draw Me Close",
      kind: "song_add",
      libraryMatch: {
        status: "found",
        item: { id: "lib-1", name: "(EN) Draw Me Close", path: "" },
      },
    }),
  ],
} as MockCommitPlan;

const templateItems = [{ id: "tpl-1", name: "WELCOME", index: 0 }];
const libraryIndex = [{ id: "lib-1", name: "(EN) Draw Me Close", path: "" }];

{
  process.env.PP_ALLOW_PARTIAL_APPLY = "false";
  let threw = false;
  try {
    buildWriteItemsFromPreview({ commitPlan, templateItems, libraryIndex });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : "";
    assert(msg.includes("What A God"), `expected song name in error, got: ${msg}`);
    assert(msg.includes("no library match"), `expected reason in error, got: ${msg}`);
  } finally {
    delete process.env.PP_ALLOW_PARTIAL_APPLY;
  }
  assert(threw, "should throw when song has no library match and partial apply disabled");
}

{
  const prev = process.env.PP_ALLOW_PARTIAL_APPLY;
  delete process.env.PP_ALLOW_PARTIAL_APPLY;
  const { items, warnings } = buildWriteItemsFromPreview({
    commitPlan,
    templateItems,
    libraryIndex,
  });
  assert(items.length === 2, `partial apply should write 2 items by default, got ${items.length}`);
  const expected = expectedNamesFromWriteItems(items);
  assert(expected.length === 2, "verify should target 2 written names");
  assert(warnings.some((w) => w.includes("What A God")), "should warn about skipped song");
  if (prev !== undefined) process.env.PP_ALLOW_PARTIAL_APPLY = prev;
}

console.log("apply-commit.test.ts: ok");
