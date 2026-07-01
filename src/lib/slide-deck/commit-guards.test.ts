import type { MockCommitPlan } from "./mock-commit";
import { blockingCreateIssues, evaluateCreatePresentationReadiness } from "./commit-guards";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const commitPlan = {
  playlistName: "SUN 2026.06.14",
  playlistPreview: [
    {
      position: 1,
      kind: "song_add" as const,
      name: "Welcome",
      source: "PCO",
      pcoTitle: "Welcome",
      libraryMatch: { status: "not_found" as const, searchTerm: "Welcome", note: "No match" },
    },
    {
      position: 2,
      kind: "song_add" as const,
      name: "Way Maker",
      source: "PCO",
      pcoTitle: "Way Maker",
      libraryMatch: {
        status: "found" as const,
        searchTerm: "Way Maker",
        item: { id: "1", name: "Way Maker", path: "" },
      },
    },
  ],
  warnings: [
    '2 element(s) have no library match (will be skipped): Welcome, Prayer Of Blessing',
  ],
  operations: [],
} as MockCommitPlan;

{
  const { ready, issues } = evaluateCreatePresentationReadiness(commitPlan, null, {});
  assert(ready, "missing Welcome/Blessing should not block build");
  assert(
    blockingCreateIssues(issues).length === 0,
    "no blocking issues when only library skips and title-like warning text",
  );
  assert(
    issues.some((i) => i.kind === "warning" && /Welcome/.test(i.message)),
    "expected warning for missing Welcome row",
  );
}

console.log("commit-guards.test.ts: ok");
