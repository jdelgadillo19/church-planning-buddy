import { randomUUID } from "node:crypto";
import type { drive_v3 } from "googleapis";
import type { UploadedDriveFile } from "@/lib/google/drive-upload";
import { upsertJsonInFolder, upsertFileInFolder } from "@/lib/google/drive-upload";
import {
  driveFolderUrl,
  ensureChildFolder,
  resolvePpNewFilesFolderId,
  resolvePpPlaylistsFolderId,
} from "@/lib/google/pp-drive-folders";
import type { SlideDeckBundle } from "./load-bundle";
import { buildServicePackageKey } from "./service-package-key";
import type {
  PublishedFileRef,
  SlideDeckBuildReport,
  SlideDeckImportMarker,
  SlideDeckPublishResult,
} from "./publish-types";
import { IMPORT_MARKER_SCHEMA_VERSION } from "./publish-types";
import type { PublishNewFilePayload } from "./publish-types";

export type PublishInstructionPackageInput = {
  drive: drive_v3.Drive;
  bundle: SlideDeckBundle;
  publishedBy?: string;
  newFilePayloads?: PublishNewFilePayload[];
};

function toFileRef(upload: UploadedDriveFile, path: string): PublishedFileRef {
  return {
    path,
    sha256: upload.sha256,
    driveFileId: upload.driveFileId,
    mimeType: upload.mimeType,
  };
}

export function buildBuildReport(bundle: SlideDeckBundle): SlideDeckBuildReport {
  const { commitPlan, applyResult, livePlaylist } = bundle;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    playlistName: commitPlan.playlistName,
    planId: commitPlan.planId,
    warnings: commitPlan.warnings,
    playlistPreview: commitPlan.playlistPreview.map((row) => ({
      position: row.position,
      name: row.name,
      kind: row.kind,
      libraryMatchStatus: row.libraryMatch?.status,
      pcoTitle: row.pcoTitle,
    })),
    applyResult: applyResult
      ? {
          playlistId: applyResult.playlistId,
          playlistName: applyResult.playlistName,
          itemCount: applyResult.itemCount,
          warnings: applyResult.warnings,
        }
      : undefined,
    livePlaylistItems: livePlaylist?.items,
  };
}

/**
 * JSON instruction package (manifest, build-report, commit-plan, import-marker).
 * Tabled for testing — kept for a future rig import path.
 */
export async function publishSlideDeckInstructionPackage(
  input: PublishInstructionPackageInput,
): Promise<SlideDeckPublishResult> {
  const { drive, bundle } = input;
  const { manifest, commitPlan } = bundle;

  const serviceFolderKey = buildServicePackageKey(manifest.serviceDate);
  const packageId = randomUUID();
  const publishedAt = new Date().toISOString();

  const playlistsParentId = await resolvePpPlaylistsFolderId(drive);
  const newFilesParentId = await resolvePpNewFilesFolderId(drive);

  const playlistsServiceFolderId = await ensureChildFolder(
    drive,
    playlistsParentId,
    serviceFolderKey,
  );
  const newFilesServiceFolderId = await ensureChildFolder(
    drive,
    newFilesParentId,
    serviceFolderKey,
  );

  const playlistFiles: PublishedFileRef[] = [];

  const manifestUpload = await upsertJsonInFolder(
    drive,
    playlistsServiceFolderId,
    "manifest.json",
    manifest,
  );
  playlistFiles.push(toFileRef(manifestUpload, "manifest.json"));

  const buildReport = buildBuildReport(bundle);
  const reportUpload = await upsertJsonInFolder(
    drive,
    playlistsServiceFolderId,
    "build-report.json",
    buildReport,
  );
  playlistFiles.push(toFileRef(reportUpload, "build-report.json"));

  const commitUpload = await upsertJsonInFolder(
    drive,
    playlistsServiceFolderId,
    "commit-plan.json",
    commitPlan,
  );
  playlistFiles.push(toFileRef(commitUpload, "commit-plan.json"));

  const newFileRefs: PublishedFileRef[] = [];
  const payloads = input.newFilePayloads ?? [];

  if (payloads.length > 0) {
    const manifestEntries: { name: string; sha256: string; driveFileId: string }[] = [];

    for (const file of payloads) {
      const mimeType = file.mimeType ?? "application/octet-stream";
      const uploaded = await upsertFileInFolder(
        drive,
        newFilesServiceFolderId,
        file.name,
        file.content,
        mimeType,
      );
      const path = `new-files/${file.name}`;
      newFileRefs.push(toFileRef(uploaded, path));
      manifestEntries.push({
        name: file.name,
        sha256: uploaded.sha256,
        driveFileId: uploaded.driveFileId,
      });
    }

    const newFilesManifestUpload = await upsertJsonInFolder(
      drive,
      newFilesServiceFolderId,
      "new-files-manifest.json",
      {
        schemaVersion: 1,
        serviceFolderKey,
        files: manifestEntries,
      },
    );
    newFileRefs.push(toFileRef(newFilesManifestUpload, "new-files-manifest.json"));
  }

  const importMarker: SlideDeckImportMarker = {
    schemaVersion: IMPORT_MARKER_SCHEMA_VERSION,
    packageId,
    serviceFolderKey,
    serviceDate: manifest.serviceDate,
    playlistName: manifest.playlistName,
    planId: manifest.planId,
    serviceTypeId: manifest.serviceTypeId,
    publishedAt,
    publishedBy: input.publishedBy,
    files: playlistFiles,
    newFiles: newFileRefs,
  };

  const markerUpload = await upsertJsonInFolder(
    drive,
    playlistsServiceFolderId,
    "import-marker.json",
    importMarker,
  );
  playlistFiles.push(toFileRef(markerUpload, "import-marker.json"));

  return {
    packageId,
    serviceFolderKey,
    playlistsParentFolderId: playlistsParentId,
    playlistsServiceFolderId,
    newFilesParentFolderId: newFilesParentId,
    newFilesServiceFolderId,
    driveFolderUrl: driveFolderUrl(playlistsServiceFolderId),
    files: playlistFiles,
    newFiles: newFileRefs,
  };
}
