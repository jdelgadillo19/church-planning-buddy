import {
  isGrgRosterPositionName,
  isPlatformTeamPositionName,
  isTeamInGrgRosterScope,
  resolveGrgSection,
  sectionKeyFromPcoPositionName,
} from "./roster-team-scope";

if (!isPlatformTeamPositionName("BAND - Drums")) {
  throw new Error("BAND - Drums should be platform position");
}
if (isPlatformTeamPositionName("Greeter")) {
  throw new Error("Greeter should not be platform position");
}
if (!isGrgRosterPositionName("Guests")) {
  throw new Error("Guests should be in roster scope");
}

const platformTeam = { id: "1", attributes: { name: "Platform Team" } };
const fohTeam = { id: "2", attributes: { name: "Front of House" } };

if (!isTeamInGrgRosterScope(platformTeam, null, "BAND - Drums")) {
  throw new Error("Platform Team + BAND position should be in scope");
}
if (isTeamInGrgRosterScope(platformTeam, null, "Greeter")) {
  throw new Error("Platform Team + Greeter should be out of scope");
}
if (isTeamInGrgRosterScope(fohTeam, null, "Front of House - Audio")) {
  throw new Error("FOH team should be out of scope");
}

if (sectionKeyFromPcoPositionName("CHOIR - Worship Leader") !== "choir") {
  throw new Error("CHOIR prefix → choir section");
}
if (resolveGrgSection("BAND - Cajon", "Platform Team") !== "band") {
  throw new Error("BAND - Cajon → band");
}
if (resolveGrgSection("Guests", "Platform Team") !== "guest") {
  throw new Error("Guests → guest");
}

console.log("roster-team-scope tests ok");
