import { describe, expect, it } from "node:test";
import { parseMessageLibraryRows, pickMessageVariant } from "./message-library";

describe("parseMessageLibraryRows", () => {
  it("parses valid header and row", () => {
    const { rows, errors } = parseMessageLibraryRows([
      ["Group", "Purpose", "Context", "Variant", "Message", "Additional", "Enabled"],
      ["TestGroup", "Signup Reminder", "normal", "A", "Hello", "", "TRUE"],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.group).toBe("TestGroup");
    expect(rows[0]?.enabled).toBe(true);
  });

  it("errors on missing columns", () => {
    const { errors } = parseMessageLibraryRows([["Group", "Purpose"]]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("pickMessageVariant", () => {
  const library = [
    {
      group: "TestGroup",
      purpose: "Signup Reminder",
      context: "normal",
      variant: "A",
      message: "A msg",
      additional: "",
      enabled: true,
    },
    {
      group: "TestGroup",
      purpose: "Signup Reminder",
      context: "away",
      variant: "A",
      message: "Away msg",
      additional: "",
      enabled: true,
    },
  ];

  it("picks matching context", () => {
    const pick = pickMessageVariant(library, {
      group: "TestGroup",
      purpose: "Signup Reminder",
      context: "away",
    });
    expect(pick?.message).toBe("Away msg");
  });
});
