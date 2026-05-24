import {
  isAliasConfigured,
  resolveTemplateAlias,
  ROSTER_ALIAS_PLACEHOLDER,
  stripTeamPrefix,
} from "./roster-position-map";

if (stripTeamPrefix("BAND - Drums") !== "Drums") {
  throw new Error("stripTeamPrefix BAND");
}
if (stripTeamPrefix("CHOIR - WL") !== "WL") {
  throw new Error("stripTeamPrefix CHOIR");
}
if (stripTeamPrefix("ALL TEAM - Practice Run") !== "Practice Run") {
  throw new Error("stripTeamPrefix ALL TEAM");
}

const map = {
  "BAND - WL": "WL",
  "BAND - Drums": ROSTER_ALIAS_PLACEHOLDER,
};

if (isAliasConfigured(ROSTER_ALIAS_PLACEHOLDER)) {
  throw new Error("[ALIAS] should not be configured");
}
if (isAliasConfigured("")) {
  throw new Error("empty should not be configured");
}
if (!isAliasConfigured("WL")) {
  throw new Error("WL should be configured");
}

if (resolveTemplateAlias("BAND - WL", map) !== "WL") {
  throw new Error("configured alias");
}
if (resolveTemplateAlias("BAND - Drums", map) !== "Drums") {
  throw new Error("fallback strip when [ALIAS]");
}
if (resolveTemplateAlias("CHOIR - Part Lead", map) !== "Part Lead") {
  throw new Error("fallback strip unknown key");
}

if (resolveTemplateAlias("BAND - Drums", map) === "[ALIAS]") {
  throw new Error("resolveTemplateAlias must never return [ALIAS] literal");
}

console.log("roster-position-map tests ok");
