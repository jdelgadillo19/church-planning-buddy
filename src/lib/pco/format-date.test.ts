import { formatPlanDateForTitle, formatPlanDateLikeSample } from "./format-date";

const titleIso = formatPlanDateForTitle("2026-05-24");
if (titleIso !== "2026.05.24") throw new Error(`iso title: ${titleIso}`);

const titleLong = formatPlanDateForTitle("May 24th, 2026");
if (titleLong !== "2026.05.24") throw new Error(`long title: ${titleLong}`);

const sample = formatPlanDateLikeSample("2026-05-24");
if (!sample.includes("May 24")) throw new Error(`sample: ${sample}`);

console.log("format-date tests ok");
