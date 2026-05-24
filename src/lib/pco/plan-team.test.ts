import { rosterByPosition, type PlanRosterRow } from "./plan-team";
import { resolveTemplateAlias, ROSTER_ALIAS_PLACEHOLDER } from "./roster-position-map";

const map = {
  "BAND - Drums": ROSTER_ALIAS_PLACEHOLDER,
  "CHOIR - Worship Leader": "WL",
};

if (resolveTemplateAlias("BAND - Drums", map) !== "Drums") {
  throw new Error("expected stripped Drums");
}
if (resolveTemplateAlias("CHOIR - Worship Leader", map) !== "WL") {
  throw new Error("expected configured WL");
}

const roster: PlanRosterRow[] = [
  {
    teamMemberId: "1",
    personId: "p1",
    displayName: "Jordan D.",
    pcoPositionName: "BAND - Drums",
    positionName: "Drums",
    grgSection: "band",
    status: "C",
  },
];

const byPos = rosterByPosition(roster);
if (!byPos.get("drums")?.displayName) {
  throw new Error("rosterByPosition should key on resolved template label");
}

console.log("plan-team tests ok");
