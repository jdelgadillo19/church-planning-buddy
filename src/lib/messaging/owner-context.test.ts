import { describe, expect, it } from "node:test";
import {
  isDeclinedStatus,
  resolveOwnerMessagingContext,
} from "./owner-context";

describe("resolveOwnerMessagingContext", () => {
  it("returns away when declined and not confirmed", () => {
    expect(
      resolveOwnerMessagingContext(
        [{ status: "D" }, { status: "U" }],
        "AC114173152",
      ),
    ).toBe("away");
  });

  it("returns normal when declined but also confirmed elsewhere", () => {
    expect(
      resolveOwnerMessagingContext(
        [{ status: "declined" }, { status: "confirmed" }],
        "AC114173152",
      ),
    ).toBe("normal");
  });

  it("returns normal when only unconfirmed", () => {
    expect(resolveOwnerMessagingContext([{ status: "U" }])).toBe("normal");
  });
});

describe("isDeclinedStatus", () => {
  it("recognizes declined codes", () => {
    expect(isDeclinedStatus("D")).toBe(true);
    expect(isDeclinedStatus("declined")).toBe(true);
    expect(isDeclinedStatus("C")).toBe(false);
  });
});
