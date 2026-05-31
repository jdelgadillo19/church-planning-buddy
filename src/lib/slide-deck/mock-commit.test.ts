import { buildSlideDeckManifest } from "./manifest";
import { buildMockCommitPlan } from "./mock-commit";
import type { ServiceOrderPlan } from "./types";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const templateItems: PpPlaylistItemRef[] = [
  { id: "1", name: "Countdown Timer", index: 0 },
  { id: "2", name: "Video Opener-Sundays", index: 1 },
  { id: "3", name: "WELCOME-Sundays", index: 2 },
  { id: "4", name: "Sermon-Sundays", index: 3 },
  { id: "5", name: "Wrap-up-Sundays", index: 4 },
];

const plan: ServiceOrderPlan = {
  planId: 1,
  serviceTypeId: 1,
  dateRaw: "2026-05-24",
  dateFormatted: "May 24th, 2026",
  items: [
    { itemId: "s1", itemType: "song", title: "The Joy", sequence: 5, song: { itemId: "s1", title: "The Joy", key: "D", artist: "X", sequence: 5 } },
    { itemId: "w1", itemType: "item", title: "Welcome", sequence: 6 },
    { itemId: "s2", itemType: "song", title: "Build My Life", sequence: 11, song: { itemId: "s2", title: "Build My Life", key: "A", artist: "Y", sequence: 11 } },
  ],
};

const manifest = buildSlideDeckManifest({
  plan,
  templateSourceFound: true,
  templateSourcePlaylistId: "tpl-1",
  templateItems,
});

manifest.elements = manifest.elements.filter((e) =>
  ["The Joy", "Welcome", "Build My Life"].includes(e.pcoTitle),
);

const commit = buildMockCommitPlan({
  manifest,
  templateItems,
  libraryIndex: [],
  propresenterConnected: true,
});

const names = commit.playlistPreview.map((r) => r.name);
const joyIdx = names.indexOf("The Joy");
const welcomeIdx = names.indexOf("WELCOME-Sundays");
assert(joyIdx >= 0 && welcomeIdx >= 0 && joyIdx < welcomeIdx, "The Joy before Welcome in preview");

const welcomeRow = commit.playlistPreview.find((r) => r.name === "WELCOME-Sundays");
assert(welcomeRow?.pcoCorrespondence === "Welcome", "welcome correspondence on row");

console.log("slide-deck/mock-commit.test.ts: ok");
