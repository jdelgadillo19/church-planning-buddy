import type { MockCommitPlaylistRow } from "./mock-commit";

/** Stable identity for a playlist preview row (survives reorder). */
export function elementKeyForRow(
  row: Pick<
    MockCommitPlaylistRow,
    "kind" | "name" | "pcoCorrespondence" | "pcoItemId" | "pcoTitle"
  >,
): string {
  if (row.kind === "song_add") {
    const id = row.pcoItemId?.trim() || row.pcoTitle?.trim() || row.name.trim();
    return `song:${id}`;
  }
  const label = row.pcoCorrespondence?.trim() || row.name.trim() || "template";
  return `template:${label}`;
}

export function attachElementKeys(rows: MockCommitPlaylistRow[]): MockCommitPlaylistRow[] {
  return rows.map((row) => ({
    ...row,
    elementKey: elementKeyForRow(row),
  }));
}

export function librarySelectionForRow(
  elementKey: string,
  row: MockCommitPlaylistRow,
  librarySelections: Record<string, string>,
): string | undefined {
  return (
    librarySelections[elementKey] ??
    librarySelections[String(row.position)] ??
    undefined
  );
}

/** Normalize position-keyed selections to stable elementKey keys for storage. */
export function librarySelectionsByElementKey(
  commitPlan: { playlistPreview: MockCommitPlaylistRow[] },
  librarySelections: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of attachElementKeys(commitPlan.playlistPreview)) {
    const elementKey = row.elementKey ?? elementKeyForRow(row);
    const sel = librarySelectionForRow(elementKey, row, librarySelections);
    if (sel) out[elementKey] = sel;
  }
  return out;
}
