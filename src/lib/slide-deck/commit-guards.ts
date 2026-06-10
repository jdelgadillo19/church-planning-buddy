import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";

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

export function assertCommitPlanReadyForQueue(
  commitPlan: MockCommitPlan,
  librarySelections: Record<string, string> = {},
): void {
  const missing = missingSongRows(commitPlan);
  if (missing.length > 0) {
    const names = missing.map((r) => r.pcoTitle ?? r.name).join(", ");
    throw new Error(
      `Cannot queue build: ${missing.length} song(s) not in ProPresenter library (${names}). Add them in ProPresenter, run Scan now on the rig, refresh preview, then send again.`,
    );
  }
  const ambiguous = unresolvedAmbiguousRows(commitPlan, librarySelections);
  if (ambiguous.length > 0) {
    const names = ambiguous.map((r) => r.pcoTitle ?? r.name).join(", ");
    throw new Error(
      `Cannot queue build: choose a library variant for ${names}.`,
    );
  }
}
