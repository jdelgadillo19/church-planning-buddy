import { resolveTemplateCorrespondence } from "./pco-pp-correspondence";
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

{
  const welcome = resolveTemplateCorrespondence("Welcome", templateItems);
  assert(welcome.status === "matched", "welcome matched");
  assert(welcome.ppItemName === "WELCOME-Sundays", "welcome pp name");

  const sermon = resolveTemplateCorrespondence("Sermon: Test Title", templateItems);
  assert(sermon.status === "matched", "sermon matched");
  assert(sermon.ppItemName === "Sermon-Sundays", "sermon pp name");
}

console.log("slide-deck/pco-pp-correspondence.test.ts: ok");
