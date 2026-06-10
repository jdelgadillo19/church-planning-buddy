import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";
import type { ImplementationPlan, ImplementationRow } from "./implementation-plan";
import {
  attachElementKeys,
  elementKeyForRow,
  librarySelectionForRow,
} from "./plan-element-key";

export type PlanSubmissionInput = {
  id: string;
  createdBy: string;
  createdAt: string;
  commitPlan: MockCommitPlan;
  librarySelections: Record<string, string>;
};

export type MergeConflict = {
  elementKey: string;
  candidates: Array<{
    submissionId: string;
    createdBy: string;
    createdAt: string;
    row: MockCommitPlaylistRow;
    changeScore: number;
  }>;
};

export type MergeResult = {
  implementationPlan: ImplementationPlan;
  conflicts: MergeConflict[];
  needsReview: boolean;
};

type KeyedRow = {
  row: MockCommitPlaylistRow;
  librarySelection?: string;
};

function normalizePlan(plan: MockCommitPlan): MockCommitPlan {
  return {
    ...plan,
    playlistPreview: attachElementKeys(plan.playlistPreview),
  };
}

function rowsByElementKey(
  plan: MockCommitPlan,
  librarySelections: Record<string, string>,
): Map<string, KeyedRow> {
  const map = new Map<string, KeyedRow>();
  for (const row of attachElementKeys(plan.playlistPreview)) {
    const elementKey = row.elementKey ?? elementKeyForRow(row);
    map.set(elementKey, {
      row: { ...row, elementKey },
      librarySelection: librarySelectionForRow(elementKey, row, librarySelections),
    });
  }
  return map;
}

function resolvedLibraryId(row: MockCommitPlaylistRow, librarySelection?: string): string | undefined {
  return librarySelection ?? row.libraryMatch?.item?.id;
}

export function rowsContentDiffer(
  a: MockCommitPlaylistRow,
  b: MockCommitPlaylistRow,
  libA?: string,
  libB?: string,
): boolean {
  if (a.name !== b.name || a.kind !== b.kind) return true;
  return resolvedLibraryId(a, libA) !== resolvedLibraryId(b, libB);
}

export function changeScoreVsBaseline(
  row: MockCommitPlaylistRow,
  baselineRow: MockCommitPlaylistRow | undefined,
  librarySelection?: string,
  baselineLibrarySelection?: string,
): number {
  if (!baselineRow) return 1;
  let score = 0;
  if (row.name !== baselineRow.name) score += 1;
  if (row.kind !== baselineRow.kind) score += 1;
  if (row.position !== baselineRow.position) score += 1;
  if (
    resolvedLibraryId(row, librarySelection) !==
    resolvedLibraryId(baselineRow, baselineLibrarySelection)
  ) {
    score += 1;
  }
  return score;
}

function baselineOrderKeys(baseline: MockCommitPlan): string[] {
  return attachElementKeys(baseline.playlistPreview).map(
    (r) => r.elementKey ?? elementKeyForRow(r),
  );
}

function pickWinner(
  candidates: MergeConflict["candidates"],
  preferredUserId?: string,
): MergeConflict["candidates"][number] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.changeScore !== a.changeScore) return b.changeScore - a.changeScore;
    const timeDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (timeDiff !== 0) return timeDiff;
    if (preferredUserId) {
      if (a.createdBy === preferredUserId && b.createdBy !== preferredUserId) return -1;
      if (b.createdBy === preferredUserId && a.createdBy !== preferredUserId) return 1;
    }
    return a.submissionId.localeCompare(b.submissionId);
  });
  return sorted[0]!;
}

export function mergeSubmissions(input: {
  submissions: PlanSubmissionInput[];
  baseline: MockCommitPlan;
  preferredUserId?: string;
  rowSourceOverrides?: Record<string, string>;
}): MergeResult {
  const baseline = normalizePlan(input.baseline);
  const baselineMap = rowsByElementKey(baseline, {});
  const baselineKeys = baselineOrderKeys(baseline);

  const sortedSubs = [...input.submissions].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  const allKeys = new Set<string>(baselineKeys);
  for (const sub of sortedSubs) {
    for (const key of rowsByElementKey(sub.commitPlan, sub.librarySelections).keys()) {
      allKeys.add(key);
    }
  }

  const orderedKeys = [
    ...baselineKeys.filter((k) => allKeys.has(k)),
    ...[...allKeys].filter((k) => !baselineKeys.includes(k)),
  ];

  const conflicts: MergeConflict[] = [];
  const implRows: ImplementationRow[] = [];
  const librarySelections: Record<string, string> = {};

  for (const elementKey of orderedKeys) {
    const candidates: MergeConflict["candidates"] = [];

    for (const sub of sortedSubs) {
      const subMap = rowsByElementKey(sub.commitPlan, sub.librarySelections);
      const entry = subMap.get(elementKey);
      if (!entry) continue;

      const base = baselineMap.get(elementKey);
      const score = changeScoreVsBaseline(
        entry.row,
        base?.row,
        entry.librarySelection,
        base?.librarySelection,
      );

      if (score === 0 && sortedSubs.length > 1) continue;

      candidates.push({
        submissionId: sub.id,
        createdBy: sub.createdBy,
        createdAt: sub.createdAt,
        row: entry.row,
        changeScore: Math.max(score, 1),
      });
    }

    if (candidates.length === 0) {
      const base = baselineMap.get(elementKey);
      if (!base) continue;
      implRows.push({
        elementKey,
        row: base.row,
        sourceSubmissionId: "baseline",
        sourceUserId: "baseline",
        sourceCreatedAt: "",
        autoSelected: true,
        hadConflict: false,
      });
      if (base.librarySelection) librarySelections[elementKey] = base.librarySelection;
      continue;
    }

    const overrideSubId = input.rowSourceOverrides?.[elementKey];
    let winner = overrideSubId
      ? candidates.find((c) => c.submissionId === overrideSubId)
      : undefined;
    if (!winner) winner = pickWinner(candidates, input.preferredUserId);

    const hadConflict =
      candidates.length > 1 &&
      candidates.some((a) =>
        candidates.some(
          (b) =>
            a.submissionId !== b.submissionId &&
            rowsContentDiffer(
              a.row,
              b.row,
              librarySelectionForRow(elementKey, a.row, {}),
              librarySelectionForRow(elementKey, b.row, {}),
            ),
        ),
      );

    if (hadConflict && !input.rowSourceOverrides?.[elementKey]) {
      conflicts.push({ elementKey, candidates });
    }

    const sub = sortedSubs.find((s) => s.id === winner.submissionId);
    const libSel = sub
      ? rowsByElementKey(sub.commitPlan, sub.librarySelections).get(elementKey)?.librarySelection
      : undefined;

    implRows.push({
      elementKey,
      row: winner.row,
      sourceSubmissionId: winner.submissionId,
      sourceUserId: winner.createdBy,
      sourceCreatedAt: winner.createdAt,
      autoSelected: !input.rowSourceOverrides?.[elementKey],
      hadConflict,
      alternatives: hadConflict
        ? candidates
            .filter((c) => c.submissionId !== winner.submissionId)
            .map((c) => ({
              submissionId: c.submissionId,
              sourceUserId: c.createdBy,
              sourceCreatedAt: c.createdAt,
              row: c.row,
            }))
        : undefined,
    });

    if (libSel) librarySelections[elementKey] = libSel;
  }

  const implementationPlan: ImplementationPlan = {
    playlistName: baseline.playlistName,
    planId: baseline.planId,
    serviceDate: baseline.serviceDate,
    rows: implRows.map((entry, index) => ({
      ...entry,
      row: { ...entry.row, position: index + 1 },
    })),
    librarySelections,
    mergeSummary: {
      conflictCount: conflicts.length,
      submissionIds: sortedSubs.map((s) => s.id),
    },
  };

  return {
    implementationPlan,
    conflicts,
    needsReview: conflicts.length > 0,
  };
}

/** Same-user selective merge: pick element keys from latest submission, rest from prior merged state. */
export function mergeSameUserSelective(input: {
  latest: PlanSubmissionInput;
  prior: PlanSubmissionInput[];
  baseline: MockCommitPlan;
  selectedElementKeysFromLatest: string[];
}): MergeResult {
  const baseline = normalizePlan(input.baseline);
  const priorMerge = mergeSubmissions({
    submissions: input.prior,
    baseline,
    preferredUserId: input.latest.createdBy,
  });

  const overrides: Record<string, string> = {};
  for (const key of input.selectedElementKeysFromLatest) {
    overrides[key] = input.latest.id;
  }

  for (const entry of priorMerge.implementationPlan.rows) {
    if (!input.selectedElementKeysFromLatest.includes(entry.elementKey)) {
      const priorSource = entry.sourceSubmissionId;
      if (priorSource !== "baseline") overrides[entry.elementKey] = priorSource;
    }
  }

  return mergeSubmissions({
    submissions: [...input.prior, input.latest],
    baseline,
    preferredUserId: input.latest.createdBy,
    rowSourceOverrides: overrides,
  });
}
