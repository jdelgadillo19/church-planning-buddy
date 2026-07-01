import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";
import { buildWriteItemsFromPreview, remapLibrarySelectionsToLive } from "./apply-commit";
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

{
  const liveIndex = [
    { id: "live-draw", name: "(EN) Draw Me Close", libraryId: "lib", libraryName: "Songs" },
  ];
  const cloudPlan = {
    playlistName: "SUN 2026.07.05",
    playlistPreview: [
      baseRow({
        position: 3,
        name: "(EN) Draw Me Close",
        kind: "song_add",
        libraryMatch: {
          status: "found",
          item: { id: "cloud-draw", name: "(EN) Draw Me Close", libraryId: "lib", libraryName: "Songs" },
        },
      }),
    ],
  } as MockCommitPlan;
  const { items } = buildWriteItemsFromPreview({
    commitPlan: cloudPlan,
    templateItems: [],
    libraryIndex: liveIndex,
  });
  assert(items.length === 1, "live name match should write cloud-matched row");
  assert(items[0]?.target_uuid === "live-draw", `expected live uuid, got ${items[0]?.target_uuid}`);
}

{
  const liveIndex = [
    { id: "live-gratitude", name: "Gratitude", libraryId: "lib", libraryName: "Songs" },
    { id: "live-gratitude-en", name: "(EN) Gratitude", libraryId: "lib", libraryName: "Songs" },
  ];
  const remapped = remapLibrarySelectionsToLive(
    { "5": "cloud-gratitude-id" },
    {
      playlistName: "SUN",
      playlistPreview: [
        baseRow({
          position: 5,
          name: "Gratitude",
          kind: "song_add",
          libraryMatch: {
            status: "ambiguous",
            candidates: [
              { id: "cloud-gratitude-id", name: "Gratitude", libraryId: "lib", libraryName: "Songs" },
              { id: "cloud-gratitude-en", name: "(EN) Gratitude", libraryId: "lib", libraryName: "Songs" },
            ],
          },
        }),
      ],
    } as MockCommitPlan,
    liveIndex,
  );
  assert(remapped["5"] === "live-gratitude", `expected live-gratitude, got ${remapped["5"]}`);
}

{
  let threw = false;
  try {
    buildWriteItemsFromPreview({
      commitPlan: {
        playlistName: "SUN",
        playlistPreview: [
          baseRow({
            position: 1,
            name: "(EN) Draw Me Close",
            kind: "song_add",
            libraryMatch: {
              status: "found",
              item: {
                id: "cloud-only",
                name: "(EN) Draw Me Close",
                libraryId: "lib",
                libraryName: "Songs",
              },
            },
          }),
        ],
      } as MockCommitPlan,
      templateItems: [],
      libraryIndex: [],
    });
  } catch (e) {
    threw = true;
    const msg = e instanceof Error ? e.message : "";
    assert(msg.includes("No playlist items to write"), `expected empty live index error, got: ${msg}`);
  }
  assert(threw, "empty live index should not fall back to cloud snapshot UUIDs");
}

console.log("apply-commit.test.ts: ok");
