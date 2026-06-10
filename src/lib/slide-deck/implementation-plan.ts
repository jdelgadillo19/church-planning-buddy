import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";

export type ImplementationRow = {
  elementKey: string;
  row: MockCommitPlaylistRow;
  sourceSubmissionId: string;
  sourceUserId: string;
  sourceCreatedAt: string;
  autoSelected: boolean;
  hadConflict: boolean;
  /** Competing sources when hadConflict — rig may override */
  alternatives?: Array<{
    submissionId: string;
    sourceUserId: string;
    sourceCreatedAt: string;
    row: MockCommitPlaylistRow;
  }>;
};

export type ImplementationPlan = {
  playlistName: string;
  planId: number;
  serviceDate?: string;
  rows: ImplementationRow[];
  librarySelections: Record<string, string>;
  mergeSummary: {
    conflictCount: number;
    submissionIds: string[];
  };
};

export function implementationPlanToCommitPlan(impl: ImplementationPlan): MockCommitPlan {
  const playlistPreview = impl.rows.map((entry, index) => ({
    ...entry.row,
    elementKey: entry.elementKey,
    position: index + 1,
  }));

  return {
    dryRun: true,
    writesBlocked: true,
    propresenterConnected: true,
    planId: impl.planId,
    playlistName: impl.playlistName,
    serviceDate: impl.serviceDate,
    templateSource: "",
    templateItemCount: 0,
    operations: [],
    playlistPreview,
    correspondences: [],
    warnings: [],
  };
}
