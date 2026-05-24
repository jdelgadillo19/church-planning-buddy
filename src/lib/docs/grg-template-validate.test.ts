import {
  GRG_PLACEHOLDER_DATE,
  GRG_PLACEHOLDER_SCANS_BEGIN,
  GRG_PLACEHOLDER_SONG_LIST,
} from "@/lib/config/grg";
import { isTemplateValidationBlocking } from "./grg-template";
import type { GrgTemplateValidationResult } from "./grg-template";

const base: GrgTemplateValidationResult = {
  ok: false,
  canSkipIntro: true,
  canApplyScans: true,
  issues: [
    { code: "missing_marker", marker: GRG_PLACEHOLDER_DATE, message: "missing date" },
  ],
};

if (!isTemplateValidationBlocking(base, { skipIntro: false, skipScans: false, hasScansToApply: true })) {
  throw new Error("should block when intro missing and skipIntro false");
}
if (isTemplateValidationBlocking(base, { skipIntro: true, skipScans: false, hasScansToApply: true })) {
  throw new Error("should not block when skipIntro true");
}

const noScans: GrgTemplateValidationResult = {
  ok: false,
  canSkipIntro: false,
  canApplyScans: false,
  issues: [
    { code: "missing_marker", marker: GRG_PLACEHOLDER_SCANS_BEGIN, message: "missing scans" },
  ],
};

if (
  !isTemplateValidationBlocking(noScans, {
    skipIntro: true,
    skipScans: false,
    hasScansToApply: true,
  })
) {
  throw new Error("should block scans when marker missing");
}

console.log("grg-template-validate tests ok");
