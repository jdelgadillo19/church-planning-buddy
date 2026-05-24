import {
  buildFilledRosterLine,
  buildRosterPreviewFromPco,
  parseRosterPositionFromLine,
  ROSTER_NAME_POSITION_PLACEHOLDER,
  sectionKeyFromHeader,
} from "./grg-roster";
import { sectionKeyFromTeamName } from "@/lib/pco/roster-team-scope";
import type { PlanRosterRow } from "@/lib/pco/plan-team";

const placeholderLine = ROSTER_NAME_POSITION_PLACEHOLDER;
const pos = parseRosterPositionFromLine(placeholderLine);
if (pos !== "[Position]") throw new Error(`expected [Position], got ${pos}`);

if (buildFilledRosterLine("Drums", "Jordan D.") !== "Jordan D.: Drums") {
  throw new Error("filled line format");
}

if (sectionKeyFromHeader("BAND (SATURDAY 14:30 CALL)") !== "band") {
  throw new Error("band header");
}
if (sectionKeyFromHeader("CHOIR (SUNDAY 7:30 CALL)") !== "choir") {
  throw new Error("choir header");
}
if (sectionKeyFromTeamName("BAND") !== "band") {
  throw new Error("band team");
}

const roster: PlanRosterRow[] = [
  {
    teamMemberId: "1",
    personId: "p1",
    displayName: "Jordan D.",
    pcoPositionName: "BAND - Drums",
    positionName: "Drums",
    teamName: "Platform Team",
    grgSection: "band",
    status: "C",
  },
  {
    teamMemberId: "2",
    personId: "p2",
    displayName: "Alex K.",
    pcoPositionName: "BAND - Keys",
    positionName: "Keys",
    teamName: "Platform Team",
    grgSection: "band",
    status: "C",
  },
];

const preview = buildRosterPreviewFromPco(roster);
if (preview.length !== 2) throw new Error("expected 2 preview entries");
if (!preview.every((e) => e.filledLine.includes(":") && e.section === "band")) {
  throw new Error("preview should list filled lines for band");
}

console.log("grg-roster tests ok");
