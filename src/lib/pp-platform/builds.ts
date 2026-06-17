import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { ImplementationPlan } from "@/lib/slide-deck/implementation-plan";
import { attachElementKeys } from "@/lib/slide-deck/plan-element-key";
import { librarySelectionForRow } from "@/lib/slide-deck/plan-element-key";
import { isPresentationRigKind } from "@/lib/slide-deck/device-context";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { SlideDeckBuildRow } from "./types";

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createAdminClient();
}

export type CreateSlideDeckBuildInput = {
  orgId: string;
  rigId?: string;
  createdBy: string;
  planId: string;
  serviceTypeId?: string;
  commitPlan: MockCommitPlan;
  librarySelections?: Record<string, string>;
  changeSummary?: string;
  publishAfterApply?: boolean;
  baseSnapshotId?: string;
  implementationPlan?: ImplementationPlan | null;
};

export function implementationPlanFromCommitPlan(
  commitPlan: MockCommitPlan,
  librarySelections: Record<string, string> = {},
): ImplementationPlan {
  const rows = attachElementKeys(commitPlan.playlistPreview);
  const libByKey: Record<string, string> = {};
  const implRows = rows.map((row, index) => {
    const elementKey = row.elementKey!;
    const lib = librarySelectionForRow(elementKey, row, librarySelections);
    if (lib) libByKey[elementKey] = lib;
    return {
      elementKey,
      row: { ...row, position: index + 1 },
      sourceSubmissionId: "direct",
      sourceUserId: "direct",
      sourceCreatedAt: "",
      autoSelected: true,
      hadConflict: false,
    };
  });

  return {
    playlistName: commitPlan.playlistName,
    planId: commitPlan.planId,
    serviceDate: commitPlan.serviceDate,
    rows: implRows,
    librarySelections: libByKey,
    mergeSummary: { conflictCount: 0, submissionIds: [] },
  };
}

export async function createSlideDeckBuild(
  input: CreateSlideDeckBuildInput,
): Promise<SlideDeckBuildRow> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_builds")
    .insert({
      org_id: input.orgId,
      rig_id: input.rigId ?? null,
      created_by: input.createdBy,
      plan_id: input.planId,
      service_type_id: input.serviceTypeId ?? null,
      commit_plan: input.commitPlan,
      library_selections: input.librarySelections ?? {},
      change_summary: input.changeSummary ?? null,
      publish_after_apply: input.publishAfterApply === true,
      base_snapshot_id: input.baseSnapshotId ?? null,
      implementation_plan: input.implementationPlan ?? null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to queue slide deck build.");
  }
  return data as SlideDeckBuildRow;
}

export async function listSlideDeckBuildsForOrg(
  orgId: string,
  limit = 15,
): Promise<SlideDeckBuildRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_builds")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as SlideDeckBuildRow[];
}

export async function getBuildById(buildId: string): Promise<SlideDeckBuildRow | null> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_builds")
    .select("*")
    .eq("id", buildId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as SlideDeckBuildRow | null;
}

export async function claimNextBuildForRig(rig: {
  id: string;
  org_id: string;
  rig_kind?: string;
}): Promise<SlideDeckBuildRow | null> {
  if (!isPresentationRigKind(rig.rig_kind)) {
    return null;
  }
  const supabase = requireAdmin();

  let query = supabase
    .from("slide_deck_builds")
    .select("*")
    .eq("org_id", rig.org_id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  const { data: pending, error: listError } = await query;
  if (listError) throw new Error(listError.message);

  const candidates = (pending ?? []) as SlideDeckBuildRow[];
  const job = candidates.find((b) => !b.rig_id || b.rig_id === rig.id);
  if (!job) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("slide_deck_builds")
    .update({
      status: "claimed",
      rig_id: rig.id,
      claimed_at: now,
      updated_at: now,
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error || !data) return null;
  return data as SlideDeckBuildRow;
}

export async function listClaimedBuildsForRig(rigId: string): Promise<SlideDeckBuildRow[]> {
  const supabase = requireAdmin();
  const { data, error } = await supabase
    .from("slide_deck_builds")
    .select("*")
    .eq("rig_id", rigId)
    .in("status", ["claimed", "applying", "failed"])
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SlideDeckBuildRow[];
}

export async function setBuildStatus(
  buildId: string,
  status: SlideDeckBuildRow["status"],
  extra?: {
    result?: SlideDeckBuildRow["result"];
    error_message?: string | null;
  },
): Promise<SlideDeckBuildRow> {
  const supabase = requireAdmin();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (status === "applying") {
    patch.claimed_at = now;
  }
  if (status === "claimed") {
    patch.error_message = extra?.error_message ?? null;
    patch.completed_at = null;
    patch.result = null;
  }
  if (status === "completed" || status === "failed") {
    patch.completed_at = now;
    patch.result = extra?.result ?? null;
    patch.error_message = extra?.error_message ?? null;
  }

  const { data, error } = await supabase
    .from("slide_deck_builds")
    .update(patch)
    .eq("id", buildId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update build.");
  return data as SlideDeckBuildRow;
}

export async function updateBuildImplementationPlan(
  buildId: string,
  implementationPlan: ImplementationPlan,
): Promise<SlideDeckBuildRow> {
  const supabase = requireAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("slide_deck_builds")
    .update({ implementation_plan: implementationPlan, updated_at: now })
    .eq("id", buildId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update implementation plan.");
  return data as SlideDeckBuildRow;
}

/** Reset a failed build so the rig operator can retry apply. */
export async function resetBuildForRetry(buildId: string): Promise<SlideDeckBuildRow> {
  return setBuildStatus(buildId, "claimed", { error_message: null, result: null });
}
