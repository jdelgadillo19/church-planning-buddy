import { implementationPlanToCommitPlan } from "./implementation-plan";
import { buildMockCommitPlan } from "./mock-commit";
import { mergeSubmissions, mergeSameUserSelective } from "./plan-merge";
import type { PlanSubmissionInput } from "./plan-merge";
import { buildSlideDeckManifest } from "./manifest";
import type { ServiceOrderPlan } from "./types";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const templateItems: PpPlaylistItemRef[] = [
  { id: "t1", name: "WELCOME-Sundays", index: 0 },
  { id: "t2", name: "Sermon-Sundays", index: 1 },
];

const libraryIndex: PpLibraryItemRef[] = [
  { id: "lib-grat-en", name: "(EN) Gratitude", libraryId: "1", libraryName: "Songs" },
  { id: "lib-grat-de", name: "(DE + EN) Gratitude", libraryId: "1", libraryName: "Songs" },
  { id: "lib-joy", name: "Joy", libraryId: "1", libraryName: "Songs" },
];

const plan: ServiceOrderPlan = {
  planId: 99,
  serviceTypeId: 1,
  dateRaw: "2026-06-14",
  dateFormatted: "June 14th, 2026",
  items: [
    {
      itemId: "song-grat",
      itemType: "song",
      title: "Gratitude",
      sequence: 1,
      song: {
        itemId: "song-grat",
        title: "Gratitude",
        key: "G",
        artist: "A",
        sequence: 1,
      },
    },
    {
      itemId: "item-welcome",
      itemType: "item",
      title: "Welcome",
      sequence: 2,
    },
    {
      itemId: "item-sermon",
      itemType: "item",
      title: "Sermon: Faith",
      sequence: 3,
    },
  ],
};

const manifest = buildSlideDeckManifest({
  plan,
  templateSourceFound: true,
  templateItems,
});

const baseline = buildMockCommitPlan({
  manifest,
  templateItems,
  libraryIndex,
  propresenterConnected: true,
});

function submission(
  id: string,
  userId: string,
  createdAt: string,
  mutate: (plan: typeof baseline) => typeof baseline,
  librarySelections: Record<string, string> = {},
): PlanSubmissionInput {
  return {
    id,
    createdBy: userId,
    createdAt,
    commitPlan: mutate(structuredClone(baseline)),
    librarySelections,
  };
}

{
  const wd = submission("sub-wd", "user-wd", "2026-06-10T10:00:00Z", (p) => {
    p.playlistPreview = p.playlistPreview.map((row) => {
      if (row.pcoTitle === "Gratitude") {
        return {
          ...row,
          name: "(EN) Gratitude",
          libraryMatch: {
            status: "found" as const,
            searchTerm: "Gratitude",
            item: libraryIndex[0],
          },
        };
      }
      return row;
    });
    return p;
  }, { "song:song-grat": "lib-grat-en" });

  const pastor = submission("sub-pastor", "user-pastor", "2026-06-12T14:00:00Z", (p) => {
    p.playlistPreview = p.playlistPreview.map((row) => {
      if (row.name === "Sermon-Sundays") {
        return {
          ...row,
          name: "Sermon-Sundays (Pastor Edit)",
          source: "Pastor slideshow",
        };
      }
      return row;
    });
    return p;
  });

  const merged = mergeSubmissions({
    submissions: [wd, pastor],
    baseline,
    preferredUserId: "user-pastor",
  });

  assert(!merged.needsReview, "WD + Pastor should auto-merge without conflict");
  const names = merged.implementationPlan.rows.map((r) => r.row.name);
  assert(names.some((n) => n.includes("Gratitude")), "includes gratitude");
  assert(names.some((n) => n.includes("Pastor Edit")), "includes pastor sermon edit");

  const gratRow = merged.implementationPlan.rows.find((r) => r.elementKey.startsWith("song:"));
  assert(gratRow?.sourceUserId === "user-wd", "gratitude from WD");
}

{
  const wd1 = submission("sub-wd1", "user-wd", "2026-06-10T10:00:00Z", (p) => p);
  const wd2 = submission("sub-wd2", "user-wd", "2026-06-11T10:00:00Z", (p) => {
    const preview = [...p.playlistPreview];
    const joyIdx = preview.findIndex((r) => r.pcoTitle === "Gratitude");
    if (joyIdx >= 0 && preview[joyIdx + 1]) {
      const a = preview[joyIdx]!;
      const b = preview[joyIdx + 1]!;
      preview[joyIdx] = { ...b, position: a.position };
      preview[joyIdx + 1] = { ...a, position: b.position };
    }
    p.playlistPreview = preview;
    return p;
  });

  const selective = mergeSameUserSelective({
    latest: wd2,
    prior: [wd1],
    baseline,
    selectedElementKeysFromLatest: [
      baseline.playlistPreview.find((r) => r.pcoTitle === "Gratitude")!.elementKey!,
    ],
  });

  assert(selective.implementationPlan.rows.length > 0, "selective merge produces rows");
  const commit = implementationPlanToCommitPlan(selective.implementationPlan);
  assert(commit.playlistPreview.length > 0, "converts to commit plan");
}

{
  const a = submission("sub-a", "user-a", "2026-06-10T10:00:00Z", (p) => {
    p.playlistPreview = p.playlistPreview.map((row) =>
      row.pcoTitle === "Gratitude"
        ? {
            ...row,
            name: "(EN) Gratitude",
            libraryMatch: {
              status: "found" as const,
              searchTerm: "Gratitude",
              item: libraryIndex[0],
            },
          }
        : row,
    );
    return p;
  }, { "song:song-grat": "lib-grat-en" });

  const b = submission("sub-b", "user-b", "2026-06-11T10:00:00Z", (p) => {
    p.playlistPreview = p.playlistPreview.map((row) =>
      row.pcoTitle === "Gratitude"
        ? {
            ...row,
            name: "(DE + EN) Gratitude",
            libraryMatch: {
              status: "found" as const,
              searchTerm: "Gratitude",
              item: libraryIndex[1],
            },
          }
        : row,
    );
    return p;
  }, { "song:song-grat": "lib-grat-de" });

  const conflicted = mergeSubmissions({
    submissions: [a, b],
    baseline,
    preferredUserId: "user-b",
  });

  assert(conflicted.needsReview, "same song different library = conflict");
  assert(conflicted.conflicts.length >= 1, "has conflict entry");
}

console.log("plan-merge.test.ts: ok");
