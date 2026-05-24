import { formatPersonShortName } from "./format-person";

if (formatPersonShortName({ first_name: "Jordan", last_name: "Delgadillo" }) !== "Jordan D.") {
  throw new Error("expected First Last Initial format");
}

if (formatPersonShortName({ first_name: "Madonna" }) !== "Madonna") {
  throw new Error("expected first-only name");
}

if (formatPersonShortName({ full_name: "Chris Tomlin" }) !== "Chris T.") {
  throw new Error("expected full_name split");
}

console.log("format-person tests ok");
