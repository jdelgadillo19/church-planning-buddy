import type { BundleSnapshot } from "@/lib/propresenter/bundle-sync/types";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";

export type PpRigRow = {
  id: string;
  org_id: string;
  display_name: string;
  device_fingerprint: string | null;
  public_key: string;
  rig_secret_hash: string | null;
  status: string;
  last_seen_at: string | null;
  paired_by: string | null;
  created_at: string;
};

export type PpIndexSnapshotRow = {
  id: string;
  org_id: string;
  rig_id: string;
  snapshot_at: string;
  schema_version: number;
  index_json: BundleSnapshot;
  delta_from_snapshot_id: string | null;
  file_count: number;
  created_at: string;
};

export type SlideDeckBuildRow = {
  id: string;
  org_id: string;
  rig_id: string | null;
  created_by: string;
  plan_id: string;
  service_type_id: string | null;
  status: string;
  commit_plan: MockCommitPlan;
  library_selections: Record<string, string>;
  change_summary: string | null;
  publish_after_apply: boolean;
  base_snapshot_id: string | null;
  result: {
    apply?: unknown;
    publish?: { driveFolderUrl?: string };
  } | null;
  error_message: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgIndexMeta = {
  snapshotId: string;
  snapshotAt: string;
  rigId: string;
  rigName: string;
  fileCount: number;
  libraryItemCount: number;
  stale: boolean;
  hasLibraryIndex: boolean;
};
