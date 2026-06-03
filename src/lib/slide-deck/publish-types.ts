export const IMPORT_MARKER_SCHEMA_VERSION = 1;

export type PublishNewFilePayload = {
  /** Filename under New Files service folder, e.g. `My Song.pro` */
  name: string;
  content: Buffer;
  mimeType?: string;
};

export type PublishedFileRef = {
  /** Path relative to service package root, e.g. `manifest.json` or `new-files/song.pro` */
  path: string;
  sha256: string;
  driveFileId: string;
  mimeType: string;
};

export type SlideDeckImportMarker = {
  schemaVersion: typeof IMPORT_MARKER_SCHEMA_VERSION;
  packageId: string;
  serviceFolderKey: string;
  serviceDate: string;
  playlistName: string;
  planId: number;
  serviceTypeId: number;
  publishedAt: string;
  /** Optional operator label (accountability only). */
  publishedBy?: string;
  files: PublishedFileRef[];
  /** Entries under ProPresenter/New Files/{service}/ */
  newFiles: PublishedFileRef[];
};

export type SlideDeckBuildReport = {
  schemaVersion: 1;
  generatedAt: string;
  playlistName: string;
  planId: number;
  warnings: string[];
  playlistPreview: Array<{
    position: number;
    name: string;
    kind: string;
    libraryMatchStatus?: string;
    pcoTitle?: string;
  }>;
  applyResult?: {
    playlistId: string;
    playlistName: string;
    itemCount: number;
    warnings: string[];
  };
  /** Items read from ProPresenter at publish time (source of truth after manual edits). */
  livePlaylistItems?: Array<{ position: number; name: string }>;
};

export type SlideDeckPublishResult = {
  packageId: string;
  serviceFolderKey: string;
  playlistsParentFolderId: string;
  playlistsServiceFolderId: string;
  newFilesParentFolderId: string;
  newFilesServiceFolderId: string;
  driveFolderUrl: string;
  files: PublishedFileRef[];
  newFiles: PublishedFileRef[];
};
