import { buildPlaylistNameFromPlanDate } from "./playlist-name";
import { buildSlideDeckManifest } from "./manifest";
import { classifyPcoForPlaylist } from "./pco-exclusions";
import { applyServiceSectionTimes } from "@/lib/pco/plan-service-section-time";
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

  const planWithSectionTimes: ServiceOrderPlan = {
    ...plan,
    items: applyServiceSectionTimes(plan.items),
  };

  const manifestWithPreOpener = buildSlideDeckManifest({
    plan: planWithSectionTimes,
    templateSourceFound: true,
    templateSourcePlaylistId: "abc-123",
  });

  const openerIncluded = manifestWithPreOpener.elements.find(
    (e) => e.pcoTitle === "Service Opener Video",
  );
  assert(openerIncluded?.playlistIntent === "include", "pre-timed opener included in manifest");

  const manifest = buildSlideDeckManifest({
    plan,
    templateSourceFound: true,
    templateSourcePlaylistId: "abc-123",
  });

  assert(manifest.dryRun === true, "dry run");
  assert(manifest.playlistName === "SUN 2026.05.31", "target name");
  assert(manifest.summary.playlistSongCount === 2, "Way Maker + Welcome in direct assembly");
  assert(manifest.summary.skippedCount === 4, "four skipped");

  const included = manifest.elements.filter((e) => e.playlistIntent === "include");
  assert(
    included.length === 2 &&
      included.some((e) => e.pcoTitle === "Way Maker") &&
      included.some((e) => e.pcoTitle === "Welcome"),
    "Way Maker and Welcome included",
  );

  const opener = manifest.elements.find((e) => e.pcoTitle === "Service Opener Video");
  assert(opener?.skipReason === "non_worship_song", "opener skipped without pre timing");

  const welcome = classifyPcoForPlaylist({
    itemId: "w",
    itemType: "item",
    title: "Welcome",
    sequence: 1,
  });
  assert(welcome.include, "welcome included in direct assembly");

  const preOpener = classifyPcoForPlaylist({
    itemId: "pre1",
    itemType: "song",
    title: "Service Opener Video",
    sequence: 1,
    time: "pre",
  });
  assert(preOpener.include, "pre-service opener included when time=pre");

  const duringOpener = classifyPcoForPlaylist({
    itemId: "d1",
    itemType: "song",
    title: "Service Opener Video",
    sequence: 1,
    time: "during",
  });
  assert(!duringOpener.include && duringOpener.reason === "non_worship_song", "during opener still skipped");

  const postSlide = classifyPcoForPlaylist({
    itemId: "p1",
    itemType: "item",
    title: "Post Service Loop",
    sequence: 1,
    time: "post",
  });
  assert(postSlide.include, "post-service item included when time=post");
}

console.log("slide-deck/manifest.test.ts: ok");
