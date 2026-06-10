import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { ImplementationPlan } from "@/lib/slide-deck/implementation-plan";
import {
  mergeSameUserSelective,
  mergeSubmissions,
  type MergeResult,
} from "@/lib/slide-deck/plan-merge";
import {
  implementationPlanFromCommitPlan,
  type CreateSlideDeckBuildInput,
} from "./builds";
import {
  listDraftSubmissionsForScope,
  markSubmissionsMerged,
  markSubmissionsSuperseded,
  submissionToMergeInput,
  type ServiceScope,
} from "./submissions";

export type SendMergeInput = {
  scope: ServiceScope;
  userId: string;
  baselineCommitPlan: MockCommitPlan;
  commitPlan?: MockCommitPlan;
  librarySelections?: Record<string, string>;
  rowSourceOverrides?: Record<string, string>;
  mergeMode?: "auto" | "same_user_full" | "same_user_selective";
  selectedElementKeysFromLatest?: string[];
  implementationPlan?: ImplementationPlan;
};

export type SendMergeOutcome = {
  implementationPlan: ImplementationPlan;
  merge: MergeResult;
  mergedSubmissionIds: string[];
  supersededSubmissionIds: string[];
};

function groupDraftsByUser(
  drafts: Awaited<ReturnType<typeof listDraftSubmissionsForScope>>,
) {
  const byUser = new Map<string, typeof drafts>();
  for (const draft of drafts) {
    const list = byUser.get(draft.created_by) ?? [];
    list.push(draft);
    byUser.set(draft.created_by, list);
  }
  return byUser;
}

export async function computeSendMerge(input: SendMergeInput): Promise<SendMergeOutcome> {
  if (input.implementationPlan) {
    return {
      implementationPlan: input.implementationPlan,
      merge: {
        implementationPlan: input.implementationPlan,
        conflicts: [],
        needsReview: false,
      },
      mergedSubmissionIds: [],
      supersededSubmissionIds: [],
    };
  }

  const drafts = await listDraftSubmissionsForScope(input.scope);
  const supersededSubmissionIds: string[] = [];

  if (drafts.length === 0) {
    const commitPlan = input.commitPlan ?? input.baselineCommitPlan;
    const implementationPlan = implementationPlanFromCommitPlan(
      commitPlan,
      input.librarySelections ?? {},
    );
    return {
      implementationPlan,
      merge: { implementationPlan, conflicts: [], needsReview: false },
      mergedSubmissionIds: [],
      supersededSubmissionIds: [],
    };
  }

  const byUser = groupDraftsByUser(drafts);
  let activeDrafts = [...drafts];

  if (input.mergeMode === "same_user_full") {
    const userDrafts = byUser.get(input.userId) ?? [];
    if (userDrafts.length > 1) {
      const sorted = [...userDrafts].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      );
      const latest = sorted[0]!;
      for (const older of sorted.slice(1)) {
        supersededSubmissionIds.push(older.id);
      }
      activeDrafts = [
        ...drafts.filter((d) => d.created_by !== input.userId),
        latest,
      ];
    }
  }

  const submissions = activeDrafts.map(submissionToMergeInput);
  const baseline = input.baselineCommitPlan;

  let merge: MergeResult;
  if (input.mergeMode === "same_user_selective" && input.selectedElementKeysFromLatest) {
    const userDrafts = [...(byUser.get(input.userId) ?? [])].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
    const latest = userDrafts[0];
    const priorUser = userDrafts.slice(1);
    const otherUsers = activeDrafts.filter((d) => d.created_by !== input.userId);

    if (!latest) {
      merge = mergeSubmissions({
        submissions,
        baseline,
        preferredUserId: input.userId,
        rowSourceOverrides: input.rowSourceOverrides,
      });
    } else {
      merge = mergeSameUserSelective({
        latest: submissionToMergeInput(latest),
        prior: [...priorUser, ...otherUsers].map(submissionToMergeInput),
        baseline,
        selectedElementKeysFromLatest: input.selectedElementKeysFromLatest,
      });
      if (input.rowSourceOverrides && Object.keys(input.rowSourceOverrides).length > 0) {
        merge = mergeSubmissions({
          submissions,
          baseline,
          preferredUserId: input.userId,
          rowSourceOverrides: input.rowSourceOverrides,
        });
      }
    }
  } else {
    merge = mergeSubmissions({
      submissions,
      baseline,
      preferredUserId: input.userId,
      rowSourceOverrides: input.rowSourceOverrides,
    });
  }

  return {
    implementationPlan: merge.implementationPlan,
    merge,
    mergedSubmissionIds: activeDrafts.map((d) => d.id),
    supersededSubmissionIds,
  };
}

export async function finalizeSendMerge(
  outcome: SendMergeOutcome,
): Promise<void> {
  if (outcome.supersededSubmissionIds.length > 0) {
    await markSubmissionsSuperseded(outcome.supersededSubmissionIds);
  }
  if (outcome.mergedSubmissionIds.length > 0) {
    await markSubmissionsMerged(outcome.mergedSubmissionIds);
  }
}

export function buildInputFromSendMerge(
  input: SendMergeInput & { createdBy: string; rigId?: string; changeSummary?: string },
  outcome: SendMergeOutcome,
): CreateSlideDeckBuildInput {
  const commitPlan = input.commitPlan ?? input.baselineCommitPlan;
  return {
    orgId: input.scope.orgId,
    rigId: input.rigId,
    createdBy: input.createdBy,
    planId: input.scope.planId,
    serviceTypeId: input.scope.serviceTypeId ?? undefined,
    commitPlan,
    librarySelections: outcome.implementationPlan.librarySelections,
    changeSummary: input.changeSummary ?? commitPlan.playlistName,
    publishAfterApply: false,
    implementationPlan: outcome.implementationPlan,
  };
}
