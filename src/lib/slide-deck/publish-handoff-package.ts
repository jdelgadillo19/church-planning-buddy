import { randomUUID } from "node:crypto";
import type { drive_v3 } from "@/lib/google/api-types";
import type { UploadedDriveFile } from "@/lib/google/drive-upload";
import { upsertFileInFolder, upsertJsonInFolder } from "@/lib/google/drive-upload";
import {
  driveFolderUrl,
  ensureChildFolder,
  resolvePpPlaylistsFolderId,
} from "@/lib/google/pp-drive-folders";
import { ensureServicePackageFolder } from "@/lib/google/services-drive-folders";
import { buildTransportZip } from "@/lib/zip/transport-zip";
import { buildStoreZip } from "@/lib/zip/buffer-zip";
import type { SlideDeckSubmissionRow } from "@/lib/pp-platform/types";
import { nativeExportFileName } from "@/lib/propresenter/playlist-native-export";
import type { PublishedFileRef, SlideDeckImportMarker } from "./publish-types";
import { IMPORT_MARKER_SCHEMA_VERSION } from "./publish-types";
import { buildServicePackageKey } from "./service-package-key";
import { buildPublishBundleFromCommit } from "./load-bundle";
import type { ApplyCommitResult } from "./apply-commit";

export type HandoffPublishInput = {
  drive: drive_v3.Drive;
  handoff: SlideDeckSubmissionRow;
  proplaylistBytes: Buffer;
  proplaylistFileName?: string;
  publishedBy?: string;
};

function toFileRef(upload: UploadedDriveFile, path: string): PublishedFileRef {
  return {
    path,
    sha256: upload.sha256,
    driveFileId: upload.driveFileId,
    mimeType: upload.mimeType,
  };
}

function driveLayout(): "legacy" | "dual" | "v1" {
  const layout = (process.env.GV_DRIVE_LAYOUT ?? "legacy").trim().toLowerCase();
  if (layout === "dual" || layout === "v1") return layout;
  return "legacy";
}

function zipDriveFileName(serviceFolderKey: string, playlistName: string): string {
  const base = playlistName.replace(/[/\\?%*:|"<>]/g, "-").trim() || "playlist";
  return `${serviceFolderKey}-${base}.zip`;
}

/**
 * Publish a complete remote-prep handoff to Services/{date}/complete-v1/handoff-{id}/.
 * Also dual-writes legacy Playlists path when GV_DRIVE_LAYOUT=dual.
 */
export async function publishHandoffPackage(
  input: HandoffPublishInput,
): Promise<{
  packageId: string;
  driveFolderUrl: string;
  servicesFolderId: string;
}> {
  const { handoff, drive } = input;
  const commitPlan = handoff.commit_plan;
  const playlistName = commitPlan.playlistName;
  const fileName =
    input.proplaylistFileName?.trim() || nativeExportFileName(playlistName);

  const applyResult: ApplyCommitResult = {
    ok: true,
    playlistId: handoff.presentation_instance_id,
    playlistName,
    itemCount: commitPlan.playlistPreview.length,
    items: commitPlan.playlistPreview.map((row) => ({
      position: row.position,
      name: row.name,
      kind: row.kind,
    })),
    warnings: [],
  };

  const bundle = buildPublishBundleFromCommit(
    commitPlan,
    applyResult,
    handoff.service_type_id ? Number(handoff.service_type_id) : undefined,
  );

  const serviceFolderKey = buildServicePackageKey(bundle.manifest.serviceDate);
  const versionMatch = handoff.version_label?.match(/-v(\d+)$/);
  const packageVersion = versionMatch ? Number(versionMatch[1]) : 1;
  const versionSuffix = handoff.version_label ?? `complete-v${packageVersion}`;
  const packageId = `${serviceFolderKey}/${versionSuffix}/handoff-${handoff.id.slice(0, 8)}`;
  const layout = driveLayout();

  const servicesFolderId = await ensureServicePackageFolder(
    drive,
    serviceFolderKey,
    handoff.handoff_status === "incomplete" ? "incomplete" : "complete",
    packageVersion,
  );

  if (!servicesFolderId && layout !== "legacy") {
    throw new Error(
      "Services/ folder not configured. Set PP_SERVICES_FOLDER_ID or PP_SERVICES_FOLDER_PATH.",
    );
  }

  const targetFolderId =
    servicesFolderId ??
    (await ensureChildFolder(
      drive,
      await resolvePpPlaylistsFolderId(drive),
      `${serviceFolderKey}/complete-handoff-${handoff.id.slice(0, 8)}`,
    ));

  const handoffSubfolder = servicesFolderId
    ? await ensureChildFolder(drive, servicesFolderId, `handoff-${handoff.id.slice(0, 8)}`)
    : targetFolderId;

  const playlistFiles: PublishedFileRef[] = [];

  const proUpload = await upsertFileInFolder(
    drive,
    handoffSubfolder,
    fileName,
    input.proplaylistBytes,
    "application/octet-stream",
  );
  playlistFiles.push(toFileRef(proUpload, fileName));

  let zipBody: Buffer;
  try {
    zipBody = await buildTransportZip({ entryName: fileName, fileBytes: input.proplaylistBytes });
  } catch {
    zipBody = buildStoreZip([{ path: fileName, data: input.proplaylistBytes }]);
  }

  const zipFileName = zipDriveFileName(serviceFolderKey, playlistName);
  const zipUpload = await upsertFileInFolder(
    drive,
    handoffSubfolder,
    zipFileName,
    zipBody,
    "application/zip",
  );
  playlistFiles.push(toFileRef(zipUpload, zipFileName));

  if (handoff.manifest) {
    const manifestUpload = await upsertJsonInFolder(
      drive,
      handoffSubfolder,
      "manifest.json",
      handoff.manifest,
    );
    playlistFiles.push(toFileRef(manifestUpload, "manifest.json"));
  }

  const commitUpload = await upsertJsonInFolder(
    drive,
    handoffSubfolder,
    "commit-plan.json",
    commitPlan,
  );
  playlistFiles.push(toFileRef(commitUpload, "commit-plan.json"));

  const importMarker: SlideDeckImportMarker & {
    handoffId: string;
    submissionStatus: "complete";
    replaceOnRig?: boolean;
    versionLabel?: string | null;
    adminApprovedForRig?: boolean;
  } = {
    schemaVersion: IMPORT_MARKER_SCHEMA_VERSION,
    packageId: randomUUID(),
    serviceFolderKey,
    serviceDate: bundle.manifest.serviceDate,
    playlistName,
    planId: bundle.manifest.planId,
    serviceTypeId: bundle.manifest.serviceTypeId,
    publishedAt: new Date().toISOString(),
    publishedBy: input.publishedBy,
    files: playlistFiles,
    newFiles: [],
    handoffId: handoff.id,
    submissionStatus: "complete",
    replaceOnRig: handoff.replace_on_rig,
    versionLabel: handoff.version_label,
    adminApprovedForRig: handoff.admin_approved_for_rig,
  };

  const markerUpload = await upsertJsonInFolder(
    drive,
    handoffSubfolder,
    "import-marker.json",
    importMarker,
  );
  playlistFiles.push(toFileRef(markerUpload, "import-marker.json"));

  if (layout === "dual" || layout === "legacy") {
    const legacyParent = await resolvePpPlaylistsFolderId(drive);
    const legacyService = await ensureChildFolder(drive, legacyParent, serviceFolderKey);
    await upsertFileInFolder(
      drive,
      legacyService,
      fileName,
      input.proplaylistBytes,
      "application/octet-stream",
    );
  }

  if (layout === "dual" || layout === "v1") {
    await upsertJsonInFolder(drive, handoffSubfolder, "handoff-meta.json", {
      handoffId: handoff.id,
      rigHandoffStatus: handoff.rig_handoff_status,
      missingElements: handoff.missing_elements ?? [],
      replaceOnRig: handoff.replace_on_rig,
      versionLabel: handoff.version_label,
      adminApprovedForRig: handoff.admin_approved_for_rig,
    });
  }

  return {
    packageId,
    driveFolderUrl: driveFolderUrl(handoffSubfolder),
    servicesFolderId: handoffSubfolder,
  };
}
