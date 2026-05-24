import {
  buildFilledRosterLineMulti,
  consolidateRosterLines,
  detectRosterConflicts,
  rosterConflictGroupId,
  rosterSelectionsComplete,
} from "./grg-roster-consolidate";
import type { PlanRosterRow } from "@/lib/pco/plan-team";

function row(partial: Partial<PlanRosterRow> & Pick<PlanRosterRow, "teamMemberId" | "displayName" | "pcoPositionName" | "positionName" | "grgSection">): PlanRosterRow {
  return {
    personId: partial.teamMemberId,
    status: "C",
    ...partial,
  };
}

const careyPartLead = row({
  teamMemberId: "c1",
  displayName: "Carey C.",
  pcoPositionName: "CHOIR - Part Lead",
  positionName: "Part Lead",
  grgSection: "choir",
});
const careyRoom = row({
  teamMemberId: "c2",
  displayName: "Carey C.",
  pcoPositionName: "CHOIR - Room Singers",
  positionName: "Room Singer",
  grgSection: "choir",
});
const jesseWl = row({
  teamMemberId: "j1",
  displayName: "Jesse D.",
  pcoPositionName: "CHOIR - Worship Leader",
  positionName: "WL",
  grgSection: "choir",
});
const timothyCajon = row({
  teamMemberId: "t1",
  displayName: "Timothy K.",
  pcoPositionName: "BAND - Cajon",
  positionName: "Cajon",
  grgSection: "band",
});
const vivantMd = row({
  teamMemberId: "v1",
  displayName: "Vivant R.",
  pcoPositionName: "BAND - Music Director",
  positionName: "MD",
  grgSection: "band",
});
const vivantKeys = row({
  teamMemberId: "v2",
  displayName: "Vivant R.",
  pcoPositionName: "BAND - Keys",
  positionName: "Keys",
  grgSection: "band",
});

if (buildFilledRosterLineMulti("Vivant R.", ["MD", "Keys"]) !== "Vivant R.: MD / Keys") {
  throw new Error("slash merge format");
}

const choirConflict = detectRosterConflicts([careyPartLead, careyRoom, jesseWl]);
if (choirConflict.length !== 1) throw new Error("expected one Carey conflict");
if (choirConflict[0].assignments.length !== 2) throw new Error("Carey should have 2 assignments");

const gid = rosterConflictGroupId("choir", "Carey C.");
const selections = { [gid]: ["c2"] };
if (!rosterSelectionsComplete([careyPartLead, careyRoom, jesseWl], undefined, selections)) {
  throw new Error("selections should be complete");
}

const consolidated = consolidateRosterLines(
  [careyPartLead, careyRoom, jesseWl, timothyCajon, vivantMd],
  undefined,
  selections,
);
const careyLines = consolidated.filter((l) => l.displayName === "Carey C.");
if (careyLines.length !== 1 || careyLines[0].filledLine !== "Carey C.: Room Singer") {
  throw new Error("Carey should appear once with Room Singer");
}
if (consolidated.filter((l) => l.displayName === "Jesse D.").length !== 1) {
  throw new Error("Jesse should appear once");
}

const bandMerge = consolidateRosterLines([vivantMd, vivantKeys], undefined, {
  [rosterConflictGroupId("band", "Vivant R.")]: ["v1", "v2"],
});
if (bandMerge.length !== 1 || bandMerge[0].filledLine !== "Vivant R.: MD / Keys") {
  throw new Error("Vivant slash merge");
}

const crossSection = consolidateRosterLines(
  [
    row({
      teamMemberId: "x1",
      displayName: "Alex P.",
      pcoPositionName: "BAND - Keys",
      positionName: "Keys",
      grgSection: "band",
    }),
    row({
      teamMemberId: "x2",
      displayName: "Alex P.",
      pcoPositionName: "CHOIR - WL",
      positionName: "WL",
      grgSection: "choir",
    }),
  ],
  undefined,
  undefined,
);
if (crossSection.length !== 2) throw new Error("cross-section: two lines allowed");

console.log("grg-roster-consolidate tests ok");
