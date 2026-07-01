import { loadWorkerEnv } from "@/lib/config/worker-env";
import { useTemplatePlaylistAssembly } from "@/lib/config/slide-deck";
import { buildFilebasePullZip, type FilebasePullManifest } from "@/lib/google/filebase-pull";
import { stageFilebasePullZip } from "@/lib/google/filebase-pull-store";
import {
  hasFilebaseDriveConfig,
  resolveFilebasePullSource,
} from "@/lib/google/filebase-drive-folders";
import { loadOrgLibrarianDrive } from "@/lib/google/org-librarian-drive";
import { getLatestSnapshotForOrg } from "@/lib/pp-platform/snapshots";
import {
  libraryIndexFromSnapshot,
  resolveTemplateFromSnapshot,
  templateItemsFromSnapshot,
} from "@/lib/pp-platform/cloud-index";
import { loadPlanServiceOrder } from "@/lib/pco/plan-service-order";
import { buildSlideDeckManifest } from "@/lib/slide-deck/manifest";
import { buildMockCommitPlan, type MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { unresolvedAmbiguousRows } from "@/lib/slide-deck/commit-guards";

export type PreparedFilebasePull = {
  commitPlan: MockCommitPlan;
  pullManifest: FilebasePullManifest;
  pullId: string;
  fileName: string;
  downloadUrl: string;
};

export async function prepareFilebasePullForPlan(input: {
  orgId: string;
  userId: string;
  planId: string;
  serviceTypeId?: string;
  librarySelections?: Record<string, string>;
}): Promise<PreparedFilebasePull> {
  const planId = input.planId.trim();
  if (!planId) throw new Error("planId is required.");

  const librarySelections = input.librarySelections ?? {};
  const workerEnv = await loadWorkerEnv();
  const useTemplateAssembly = useTemplatePlaylistAssembly(workerEnv);

  const librarian = await loadOrgLibrarianDrive(input.orgId, workerEnv);
  if (!librarian) {
    throw new Error(
      "File librarian not configured. Owner must connect Google (set PP_LIBRARIAN_USER_ID).",
    );
  }

  const snapshot = await getLatestSnapshotForOrg(input.orgId);
  if (!snapshot?.index_json) {
    throw new Error("No library index snapshot — run Scan now on the presentation rig.");
  }

  const plan = await loadPlanServiceOrder({
    planId,
    serviceTypeId: input.serviceTypeId,
  });

  const template = useTemplateAssembly
    ? resolveTemplateFromSnapshot(snapshot.index_json)
    : { sourceFound: false, itemCount: 0 };
  const templateItems = useTemplateAssembly
    ? templateItemsFromSnapshot(snapshot.index_json)
    : [];
  const manifest = buildSlideDeckManifest({
    plan,
    templateSourceFound: template.sourceFound,
    templateSourcePlaylistId: template.sourcePlaylistId,
    templateSourcePlaylistPath: template.sourcePlaylistPath,
    templateItems,
    propresenterConnected: true,
    useTemplateAssembly,
  });
  const cloudLibrary = libraryIndexFromSnapshot(snapshot.index_json);

  const commitPlan = buildMockCommitPlan({
    manifest,
    templateItems,
    libraryIndex: cloudLibrary,
    propresenterConnected: true,
    useCloudIndex: true,
    useTemplateAssembly,
  });

  const unresolved = unresolvedAmbiguousRows(commitPlan, librarySelections);
  if (unresolved.length > 0) {
    const labels = unresolved.map((r) => r.name).join(", ");
    throw new Error(`Resolve library variants before pulling: ${labels}`);
  }

  const { drive } = librarian;

  if (!hasFilebaseDriveConfig(workerEnv)) {
    throw new Error(
      "Filebase folder not configured. Set GV_DRIVE_LAYOUT_ROOT_FOLDER_ID + Filebase path, PP_FILEBASE_FOLDER_ID, or PP_COMPUTER_FILEBASE_FOLDER_ID.",
    );
  }

  const pullSource = await resolveFilebasePullSource(drive, workerEnv);
  if (!pullSource) {
    throw new Error(
      "No files found on Google Drive under Shared Drive Filebase/ or the presentation Computer backup. Run M2 seed or confirm Envy Drive sync.",
    );
  }

  const { zip, manifest: pullManifest } = await buildFilebasePullZip({
    drive,
    commitPlan,
    manifest,
    cloudLibraryIndex: cloudLibrary,
    templateItems,
    snapshotFiles: pullSource.index.files,
    librarySelections,
  });

  if (pullManifest.requestedPaths.length === 0) {
    throw new Error(
      "No filebase files matched this plan. Confirm songs exist in Filebase/Libraries/ and rig Scan is current.",
    );
  }

  if (pullManifest.missingPaths.length > 0) {
    throw new Error(
      `Filebase pull incomplete — missing: ${pullManifest.missingPaths.slice(0, 8).join(", ")}${
        pullManifest.missingPaths.length > 8 ? "…" : ""
      }`,
    );
  }

  if (pullManifest.fileCount === 0) {
    throw new Error("Filebase pull produced an empty zip.");
  }

  const fileName = `filebase-pull-${planId}-${Date.now()}.zip`;
  const staged = await stageFilebasePullZip({
    orgId: input.orgId,
    userId: input.userId,
    planId,
    fileName,
    zip,
  });

  if (!staged) {
    throw new Error(
      "Could not stage file download on the server. Try again in a moment or contact your admin.",
    );
  }

  return {
    commitPlan,
    pullManifest,
    pullId: staged.pullId,
    fileName,
    downloadUrl: staged.downloadUrl,
  };
}
