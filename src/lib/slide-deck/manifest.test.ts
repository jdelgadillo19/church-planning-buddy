import { buildPlaylistNameFromPlanDate } from "./playlist-name";
import { buildSlideDeckManifest } from "./manifest";
import { classifyPcoForPlaylist } from "./pco-exclusions";
import type { ServiceOrderPlan } from "./types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

{
  const name = buildPlaylistNameFromPlanDate("2026-05-31");
  assert(name === "SUN 2026.05.31", `playlist name, got ${name}`);
}

{
  const plan: ServiceOrderPlan = {
    planId: 87788328,
    serviceTypeId: 1,
    dateRaw: "2026-05-31",
    dateFormatted: "May 31st, 2026",
    items: [
      { itemId: "h1", itemType: "header", title: "Pre-Service", sequence: 1 },
      {
        itemId: "s0",
        itemType: "song",
        title: "Service Opener Video",
        sequence: 2,
        song: {
          itemId: "s0",
          title: "Service Opener Video",
          key: "D",
          artist: "XX",
          sequence: 2,
        },
      },
      {
        itemId: "s1",
        itemType: "song",
        title: "Way Maker",
        sequence: 3,
        song: {
          itemId: "s1",
          title: "Way Maker",
          key: "Key of D",
          artist: "Sinach",
          sequence: 3,
        },
      },
      { itemId: "i1", itemType: "item", title: "Welcome", sequence: 4 },
      { itemId: "i2", itemType: "item", title: "Get Ready Guide", sequence: 5 },
      {
        itemId: "i3",
        itemType: "item",
        title: "ProPresenter: Post Service Slides and Music",
        sequence: 6,
      },
    ],
  };

  const manifest = buildSlideDeckManifest({
    plan,
    templateSourceFound: true,
    templateSourcePlaylistId: "abc-123",
  });

  assert(manifest.dryRun === true, "dry run");
  assert(manifest.playlistName === "SUN 2026.05.31", "target name");
  assert(manifest.summary.playlistSongCount === 1, "one worship song");
  assert(manifest.summary.skippedCount === 5, "five skipped");

  const included = manifest.elements.filter((e) => e.playlistIntent === "include");
  assert(included.length === 1 && included[0]?.pcoTitle === "Way Maker", "Way Maker included");

  const opener = manifest.elements.find((e) => e.pcoTitle === "Service Opener Video");
  assert(opener?.skipReason === "non_worship_song", "opener skipped");

  const welcome = classifyPcoForPlaylist({
    itemId: "w",
    itemType: "item",
    title: "Welcome",
    sequence: 1,
  });
  assert(!welcome.include && welcome.reason === "template_covered", "welcome template covered");
}

console.log("slide-deck/manifest.test.ts: ok");
