import type { SlideDeckSubmissionRow } from "@/lib/pp-platform/types";
import type { MockCommitPlan } from "./mock-commit";
import { missingSongRows, unresolvedAmbiguousRows } from "./commit-guards";

export type HandoffStatus = "complete" | "incomplete";

export type MissingElement = {
  kind: "missing_song" | "ambiguous_song" | "template" | "sermon" | "playlist_diff";
  label: string;
  detail?: string;
};

export type MissingFileRef = {
  label: string;
  libraryItemId?: string;
  libraryName?: string;
  reason: string;
};

function handoffRank(status: string | null | undefined): number {
  if (status === "complete") return 2;
  if (status === "incomplete") return 1;
  return 0;
}

function handoffRecencyMs(row: SlideDeckSubmissionRow): number {
  const raw = row.playlist_file_mtime ?? row.updated_at ?? row.created_at;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** Most-complete first, then newest by file mtime (fallback updated_at). */
export function sortHandoffsForDiscovery(
  handoffs: SlideDeckSubmissionRow[],
): SlideDeckSubmissionRow[] {
  return [...handoffs].sort((a, b) => {
    const byStatus = handoffRank(b.handoff_status) - handoffRank(a.handoff_status);
    if (byStatus !== 0) return byStatus;
    return handoffRecencyMs(b) - handoffRecencyMs(a);
  });
}

export function defaultHandoffSelection(
  handoffs: SlideDeckSubmissionRow[],
): SlideDeckSubmissionRow | null {
  const sorted = sortHandoffsForDiscovery(handoffs);
  return sorted[0] ?? null;
}

export function isHandoffRow(row: SlideDeckSubmissionRow): boolean {
  return row.handoff_status === "complete" || row.handoff_status === "incomplete";
}

export function missingElementsFromCommitPlan(
  commitPlan: MockCommitPlan,
  librarySelections: Record<string, string> = {},
  playlistDiffs: string[] = [],
): MissingElement[] {
  const out: MissingElement[] = [];

  for (const row of missingSongRows(commitPlan)) {
    out.push({
      kind: "missing_song",
      label: row.pcoTitle ?? row.name,
      detail: "Not in the current filebase index.",
    });
  }

  for (const row of unresolvedAmbiguousRows(commitPlan, librarySelections)) {
    out.push({
      kind: "ambiguous_song",
      label: row.pcoTitle ?? row.name,
      detail: "Select a library variant.",
    });
  }

  for (const w of commitPlan.warnings) {
    if (/template playlist/i.test(w) || /template item/i.test(w)) {
      out.push({ kind: "template", label: "Template", detail: w });
    } else if (/welcome|sermon|message/i.test(w)) {
      out.push({ kind: "sermon", label: "Sermon / message slot", detail: w });
    }
  }

  for (const d of playlistDiffs.slice(0, 20)) {
    out.push({ kind: "playlist_diff", label: d });
  }

  return out;
}
