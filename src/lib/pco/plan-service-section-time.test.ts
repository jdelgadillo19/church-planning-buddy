import { applyServiceSectionTimes } from "./plan-service-section-time";
import { classifyPcoForPlaylist } from "@/lib/slide-deck/pco-exclusions";
import type { ServiceOrderItem } from "@/lib/slide-deck/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const sampleItems: ServiceOrderItem[] = [
  { itemId: "h1", itemType: "header", title: "Pre-Service", sequence: 1, time: "during" },
  {
    itemId: "s0",
    itemType: "song",
    title: "Service Opener Video",
    sequence: 2,
    time: "during",
  },
  {
    itemId: "s1",
    itemType: "song",
    title: "Way Maker",
    sequence: 3,
    time: "during",
  },
  { itemId: "h2", itemType: "header", title: "Worship", sequence: 4, time: "during" },
  {
    itemId: "s2",
    itemType: "song",
    title: "Service Opener Video",
    sequence: 5,
    time: "during",
  },
];

{
  const timed = applyServiceSectionTimes(sampleItems);
  const preOpener = timed.find((i) => i.itemId === "s0");
  const preSong = timed.find((i) => i.itemId === "s1");
  const duringOpener = timed.find((i) => i.itemId === "s2");

  assert(preOpener?.time === "pre", "opener under Pre-Service header should be pre");
  assert(preSong?.time === "pre", "items before next header inherit pre section");
  assert(duringOpener?.time === "during", "opener after Worship header stays during");

  const preDecision = classifyPcoForPlaylist(preOpener!);
  assert(preDecision.include, "pre-service Service Opener Video should be included");

  const duringDecision = classifyPcoForPlaylist(duringOpener!);
  assert(
    !duringDecision.include && duringDecision.reason === "non_worship_song",
    "during-service opener still excluded",
  );
}

console.log("plan-service-section-time.test.ts: ok");
