import { randomUUID } from "node:crypto";
import type { drive_v3 } from "@/lib/google/api-types";
import type { UploadedDriveFile } from "@/lib/google/drive-upload";
import { upsertFileInFolder, upsertJsonInFolder } from "@/lib/google/drive-upload";
import {
  driveFolderUrl,
  ensureChildFolder,
  resolvePpNewFilesFolderId,
  resolvePpPlaylistsFolderId,
} from "@/lib/google/pp-drive-folders";
import { exportPlaylistNative } from "@/lib/propresenter/playlist-native-export";
import { buildTransportZip } from "@/lib/zip/transport-zip";
import type { SlideDeckBundle } from "./load-bundle";
import { buildServicePackageKey } from "./service-package-key";
import type { PublishedFileRef, PublishNewFilePayload, SlideDeckPublishResult } from "./publish-types";

export type { PublishNewFilePayload } from "./publish-types";

export type PublishSlideDeckInput = {
  drive: drive_v3.Drive;
  bundle: SlideDeckBundle;
  publishedBy?: string;
  /** Optional binaries to upload into New Files/{service}/ */
  newFilePayloads?: PublishNewFilePayload[];
  /** Operator-exported .proplaylist on disk (skips AppleScript when set). */
  nativeExportPath?: string;
  /** Browser-uploaded .proplaylist bytes (hosted publish; skips AppleScript). */
  uploadedProplaylist?: { bytes: Buffer; fileName: string };
};

function toFileRef(upload: UploadedDriveFile, path: string): PublishedFileRef {
  return {
    path,
    sha256: upload.sha256,
    driveFileId: upload.driveFileId,
    mimeType: upload.mimeType,
  };
}

function resolvePublishPlaylist(bundle: SlideDeckBundle): { playlistName: string } {
  const playlistName =
    bundle.applyResult?.playlistName ??
    bundle.livePlaylist?.playlistName ??
    bundle.commitPlan.playlistName;

  if (!playlistName?.trim()) {
    throw new Error(
      "Cannot publish playlist: no playlist name. " +
        "Apply the commit on this Mac or ensure the service playlist exists in ProPresenter.",
    );
  }

  return { playlistName: playlistName.trim() };
}

function zipDriveFileName(serviceFolderKey: string, playlistName: string): string {
  const base = playlistName.replace(/[/\\?%*:|"<>]/g, "-").trim() || "playlist";
  return `${serviceFolderKey}-${base}.zip`;
}

/**
 * Upload slide-deck handoff: ProPresenter native export (.proplaylist) in a transport zip.
 * JSON instruction packages remain in `publish-instructions.ts` (tabled).
 */
export async function publishSlideDeckPackage(
  input: PublishSlideDeckInput,
): Promise<SlideDeckPublishResult> {
  const { drive, bundle } = input;
  const { manifest } = bundle;

  const serviceFolderKey = buildServicePackageKey(manifest.serviceDate);
  const packageId = randomUUID();

  const { playlistName } = resolvePublishPlaylist(bundle);

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

  const nativeExport = input.uploadedProplaylist
    ? {
        bytes: input.uploadedProplaylist.bytes,
        fileName: input.uploadedProplaylist.fileName,
        sourcePath: "(uploaded)",
      }
    : await exportPlaylistNative({
        playlistName,
        nativeExportPath: input.nativeExportPath,
      });

  const zipBody = await buildTransportZip({
    entryName: nativeExport.fileName,
    fileBytes: nativeExport.bytes,
  });
  const zipFileName = zipDriveFileName(serviceFolderKey, playlistName);

  const zipUpload = await upsertFileInFolder(
    drive,
    playlistsServiceFolderId,
    zipFileName,
    zipBody,
    "application/zip",
  );

  const playlistFiles: PublishedFileRef[] = [toFileRef(zipUpload, zipFileName)];

  const proplaylistUpload = await upsertFileInFolder(
    drive,
    playlistsServiceFolderId,
    nativeExport.fileName,
    nativeExport.bytes,
    "application/octet-stream",
  );
  playlistFiles.push(toFileRef(proplaylistUpload, nativeExport.fileName));

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
