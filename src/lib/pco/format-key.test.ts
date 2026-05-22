import { formatPitchKey, keyFromItemAttribute } from "./format-key";

const cases: Array<[Parameters<typeof formatPitchKey>[0], string]> = [
  [{ starting_key: "C", starting_minor: false, name: "Original Key" }, "C"],
  [{ starting_key: "Ab", starting_minor: false, name: "High Male" }, "Ab"],
  [{ name: "C: Original Key" }, "C"],
  [{ name: "Original Key" }, ""],
];

for (const [input, expected] of cases) {
  const got = formatPitchKey(input);
  if (got !== expected) throw new Error(`formatPitchKey(${JSON.stringify(input)}) = ${got}, want ${expected}`);
}

if (keyFromItemAttribute("C: Original Key") !== "C") throw new Error("keyFromItemAttribute failed");

console.log("format-key tests ok");
