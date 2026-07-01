import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";
import type { SlideDeckManifest } from "./types";

export function missingSongRows(
  commitPlan: { playlistPreview: MockCommitPlaylistRow[] } | null,
): MockCommitPlaylistRow[] {
  if (!commitPlan) return [];
  return commitPlan.playlistPreview.filter(
    (row) => row.kind === "song_add" && row.libraryMatch?.status === "not_found",
  );
}

export function unresolvedAmbiguousRows(
  commitPlan: { playlistPreview: MockCommitPlaylistRow[] } | null,
  librarySelections: Record<string, string>,
): MockCommitPlaylistRow[] {
  if (!commitPlan) return [];
  return commitPlan.playlistPreview.filter(
    (row) =>
      row.kind === "song_add" &&
      row.libraryMatch?.status === "ambiguous" &&
      !librarySelections[String(row.position)],
  );
}

export type CreatePresentationIssue = {
  kind: "missing_song" | "ambiguous_song" | "template" | "sermon" | "warning";
  message: string;
};

/** Issues that block Send, Download, and Build in Client. Missing library items are warnings only. */
export function isBlockingCreateIssue(issue: CreatePresentationIssue): boolean {
  return (
    issue.kind === "ambiguous_song" || issue.kind === "template" || issue.kind === "sermon"
  );
}

export function blockingCreateIssues(issues: CreatePresentationIssue[]): CreatePresentationIssue[] {
  return issues.filter(isBlockingCreateIssue);
}

export function templateAndSermonIssues(
  manifest: SlideDeckManifest | null,
  commitPlan: MockCommitPlan | null,
): CreatePresentationIssue[] {
  const issues: CreatePresentationIssue[] = [];
  if (manifest?.template.sourceFound === false) {
    issues.push({
      kind: "template",
      message: `Template playlist "${manifest.template.sourcePlaylistName}" was not found in the filebase.`,
    });
  }
  if (!commitPlan) return issues;

  for (const w of commitPlan.warnings) {
    if (/template playlist/i.test(w) || /Could not read template/i.test(w)) {
      issues.push({ kind: "template", message: w });
    } else if (/Welcome|sermon|message/i.test(w) || /template item/i.test(w)) {
      issues.push({ kind: "sermon", message: w });
    } else if (/not in the current filebase|cloud index/i.test(w)) {
      issues.push({ kind: "warning", message: w });
    }
  }

  const blockedOps = commitPlan.operations.filter((o) => o.status === "missing_prerequisite");
  for (const op of blockedOps) {
    issues.push({
      kind: "template",
      message: `${op.label}: missing prerequisite.`,
    });
  }

  return issues;
}

export function evaluateCreatePresentationReadiness(
  commitPlan: MockCommitPlan,
  manifest: SlideDeckManifest | null,
  librarySelections: Record<string, string> = {},
): { ready: boolean; issues: CreatePresentationIssue[] } {
  const issues: CreatePresentationIssue[] = [];

  for (const row of missingSongRows(commitPlan)) {
    issues.push({
      kind: "warning",
      message: `Not in filebase (will be skipped): ${row.pcoTitle ?? row.name}`,
    });
  }

  for (const row of unresolvedAmbiguousRows(commitPlan, librarySelections)) {
    issues.push({
      kind: "ambiguous_song",
      message: `Select a library variant for: ${row.pcoTitle ?? row.name}`,
    });
  }

  issues.push(...templateAndSermonIssues(manifest, commitPlan));

  return { ready: blockingCreateIssues(issues).length === 0, issues };
}

export function assertCommitPlanReadyForQueue(
  commitPlan: MockCommitPlan,
  librarySelections: Record<string, string> = {},
): void {
  const { ready, issues } = evaluateCreatePresentationReadiness(commitPlan, null, librarySelections);
  if (ready) return;
  const blocking = blockingCreateIssues(issues);
  throw new Error(blocking.map((i) => i.message).join(" "));
}
