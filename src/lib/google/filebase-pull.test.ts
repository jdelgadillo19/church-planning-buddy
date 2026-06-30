import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import {
  buildFilebasePullZip,
  extractMediaReferencesFromPresentation,
  findSnapshotPathsForSong,
  resolveFilebasePathsForPlan,
  resolveMediaPathsForReferences,
  resolveTemplatePresentationPaths,
} from "./filebase-pull";

const snapshotFiles = [
  { relativePath: "Libraries/Default/Amazing Grace.proBundle/data.json", driveFileId: "a1" },
  { relativePath: "Libraries/Default/Amazing Grace.proBundle/slides.bin", driveFileId: "a2" },
  { relativePath: "Libraries/Default/Old Hymn.pro", driveFileId: "b1" },
  { relativePath: "Playlists/Sundays Template.proplaylist", driveFileId: "t1" },
  { relativePath: "Libraries/Import/(EN) Living Hope .pro", driveFileId: "lh-import" },
  { relativePath: "Libraries/Songs/(EN) Living Hope .pro", driveFileId: "lh-songs" },
  { relativePath: "Libraries/Import/(EN) Holy Forever.pro", driveFileId: "hf-import" },
  { relativePath: "Libraries/Songs/(EN) Holy Forever.pro", driveFileId: "hf-songs" },
  { relativePath: "Libraries/Import/WELCOME-Sundays.pro", driveFileId: "w-import" },
  { relativePath: "Libraries/Service Order/WELCOME-Sundays.pro", driveFileId: "w-so" },
  { relativePath: "Libraries/Service Order/Countdown Timer.pro", driveFileId: "cd" },
  { relativePath: "Media/Assets/Backgrounds/SS_Watercolor_003b.mp4", driveFileId: "media-bg", size: 10 },
  { relativePath: "Media/Assets/Current Files/SS_Watercolor_003b.mp4", driveFileId: "media-bg-current", size: 10 },
  { relativePath: "Media/Assets/Welcome Slide.png", driveFileId: "media-welcome", size: 10 },
  { relativePath: "Media/Assets/Huge Opener.mp4", driveFileId: "media-huge", size: 5000 },
];

{
  const paths = findSnapshotPathsForSong("Amazing Grace", snapshotFiles);
  if (paths.length !== 2 || !paths.every((p) => p.includes("Amazing Grace.proBundle"))) {
    throw new Error(`expected proBundle tree paths, got ${JSON.stringify(paths)}`);
  }
}

{
  const paths = findSnapshotPathsForSong("Old Hymn", snapshotFiles);
  if (paths.length !== 1 || paths[0] !== "Libraries/Default/Old Hymn.pro") {
    throw new Error(`expected .pro path, got ${JSON.stringify(paths)}`);
  }
}

{
  const paths = findSnapshotPathsForSong("(EN) Living Hope ", snapshotFiles, { libraryName: "Songs" });
  if (paths.length !== 1 || paths[0] !== "Libraries/Songs/(EN) Living Hope .pro") {
    throw new Error(`expected Songs copy only, got ${JSON.stringify(paths)}`);
  }
}

{
  const paths = findSnapshotPathsForSong("(EN) Holy Forever", snapshotFiles, { libraryName: "Songs" });
  if (paths.length !== 1 || paths[0] !== "Libraries/Songs/(EN) Holy Forever.pro") {
    throw new Error(`expected Songs Holy Forever, got ${JSON.stringify(paths)}`);
  }
}

{
  const paths = findSnapshotPathsForSong("Holy Forever", snapshotFiles);
  if (paths.length !== 0) {
    throw new Error(`PCO title alone should not match prefixed .pro names, got ${JSON.stringify(paths)}`);
  }
}

const commitPlan = {
  dryRun: true as const,
  writesBlocked: true as const,
  planId: 123,
  playlistName: "SUN 2026.06.21",
  serviceDate: "2026-06-21",
  playlistPreview: [
    {
      position: 1,
      kind: "song_add" as const,
      name: "Amazing Grace",
      source: "PCO",
      libraryMatch: {
        status: "found" as const,
        item: { id: "1", name: "Amazing Grace", libraryId: "L", libraryName: "Default" },
        searchTerm: "Amazing Grace",
      },
    },
  ],
  operations: [],
  correspondences: [],
  warnings: [],
  propresenterConnected: false,
  templateSource: "Sundays Template",
  templateItemCount: 10,
} satisfies MockCommitPlan;

{
  const paths = resolveFilebasePathsForPlan(commitPlan, null, [], snapshotFiles);
  if (paths.songPaths.length !== 2) {
    throw new Error(`expected 2 song paths, got ${JSON.stringify(paths)}`);
  }
}

{
  const templateItems = [
    { id: "1", name: "WELCOME-Sundays", index: 0 },
    { id: "2", name: "Countdown Timer", index: 1 },
  ];
  const templatePaths = resolveTemplatePresentationPaths(templateItems, snapshotFiles);
  if (
    templatePaths.length !== 2 ||
    !templatePaths.includes("Libraries/Service Order/WELCOME-Sundays.pro") ||
    !templatePaths.includes("Libraries/Service Order/Countdown Timer.pro")
  ) {
    throw new Error(`expected Service Order template paths, got ${JSON.stringify(templatePaths)}`);
  }

  const merged = resolveFilebasePathsForPlan(commitPlan, null, [], snapshotFiles, {}, templateItems);
  if (merged.templatePaths.length !== 2 || merged.requestedPaths.length !== 4) {
    throw new Error(`expected songs + template merge, got ${JSON.stringify(merged)}`);
  }
}

{
  const holyForeverPlan = {
    ...commitPlan,
    playlistPreview: [
      {
        position: 2,
        kind: "song_add" as const,
        name: "Holy Forever",
        elementKey: "song:2",
        source: "PCO",
        libraryMatch: {
          status: "ambiguous" as const,
          searchTerm: "Holy Forever",
          candidates: [
            { id: "hf-en", name: "(EN) Holy Forever", libraryId: "S", libraryName: "Songs" },
            { id: "hf-de", name: "(EN + DE) Holy forever E+D", libraryId: "S", libraryName: "Songs" },
          ],
          note: "2 library matches",
        },
      },
    ],
  } satisfies MockCommitPlan;

  const withoutSelection = resolveFilebasePathsForPlan(holyForeverPlan, null, [], snapshotFiles);
  if (withoutSelection.songPaths.length !== 0) {
    throw new Error(`unresolved ambiguous should pull nothing, got ${JSON.stringify(withoutSelection)}`);
  }

  const cloud = [
    { id: "hf-en", name: "(EN) Holy Forever", libraryId: "S", libraryName: "Songs" },
    { id: "hf-de", name: "(EN + DE) Holy forever E+D", libraryId: "S", libraryName: "Songs" },
  ];
  const withSelection = resolveFilebasePathsForPlan(
    holyForeverPlan,
    null,
    cloud,
    snapshotFiles,
    { "song:2": "hf-en" },
  );
  if (
    withSelection.songPaths.length !== 1 ||
    withSelection.songPaths[0] !== "Libraries/Songs/(EN) Holy Forever.pro"
  ) {
    throw new Error(`expected disambiguated Holy Forever, got ${JSON.stringify(withSelection)}`);
  }
}

{
  const refs = extractMediaReferencesFromPresentation(
    Buffer.from(
      [
        "(EN) Great Are You Lord",
        "SS_Watercolor_003b.mp4",
        "Media/Assets/Welcome Slide.png",
        "not-media.txt",
      ].join("\0"),
    ),
  );
  if (
    refs.length !== 2 ||
    !refs.includes("SS_Watercolor_003b.mp4") ||
    !refs.includes("Media/Assets/Welcome Slide.png")
  ) {
    throw new Error(`expected media refs from presentation bytes, got ${JSON.stringify(refs)}`);
  }
}

{
  const refs = extractMediaReferencesFromPresentation(
    Buffer.from(
      [
        "file:///Users/example/ProPresenter/Media/Assets/Current%20Files/JOTM2%20-%20Host%20Slide.png",
        "Media/Assets/Current Files/JOTM2 - Host Slide.png",
      ].join("\0"),
    ),
  );
  if (
    refs.some((ref) => ref === "20Slide.png" || ref === "20Files/JOTM2 - Host Slide.png") ||
    !refs.includes("Media/Assets/Current Files/JOTM2 - Host Slide.png")
  ) {
    throw new Error(`expected encoded media refs without false positives, got ${JSON.stringify(refs)}`);
  }
}

{
  const resolved = resolveMediaPathsForReferences(
    ["SS_Watercolor_003b.mp4", "Media/Assets/Welcome Slide.png", "Missing.mov"],
    snapshotFiles,
  );
  if (
    !resolved.mediaPaths.includes("Media/Assets/Backgrounds/SS_Watercolor_003b.mp4") ||
    !resolved.mediaPaths.includes("Media/Assets/Welcome Slide.png") ||
    resolved.mediaPaths.includes("Media/Assets/Current Files/SS_Watercolor_003b.mp4") ||
    !resolved.missingMediaPaths.includes("Missing.mov")
  ) {
    throw new Error(`expected media path resolution, got ${JSON.stringify(resolved)}`);
  }
}

async function testBuildPrioritizesImagesOverVideosWithinMediaBudget() {
  const mediaCommitPlan = {
    ...commitPlan,
    playlistPreview: [
      {
        position: 1,
        kind: "song_add" as const,
        name: "Old Hymn",
        source: "PCO",
        libraryMatch: {
          status: "found" as const,
          item: { id: "old", name: "Old Hymn", libraryId: "L", libraryName: "Default" },
          searchTerm: "Old Hymn",
        },
      },
    ],
  } satisfies MockCommitPlan;
  const prioritySnapshot = [
    { relativePath: "Libraries/Default/Old Hymn.pro", driveFileId: "b1" },
    { relativePath: "Media/Assets/Announcement.png", driveFileId: "announcement", size: 20 },
    { relativePath: "Media/Assets/Opener.mp4", driveFileId: "opener", size: 40 },
  ];
  const filesById = new Map<string, Buffer>([
    ["b1", Buffer.from("Old Hymn\0Opener.mp4\0Announcement.png")],
    ["announcement", Buffer.alloc(20)],
    ["opener", Buffer.alloc(40)],
  ]);
  const drive = {
    files: {
      get: async ({ fileId }: { fileId: string }) => ({
        data: filesById.get(fileId) ?? Buffer.alloc(0),
      }),
    },
  };

  const built = await buildFilebasePullZip({
    drive: drive as never,
    commitPlan: mediaCommitPlan,
    manifest: null,
    cloudLibraryIndex: [],
    snapshotFiles: prioritySnapshot,
    mediaMaxFileBytes: 100,
    mediaMaxTotalBytes: 50,
  });
  const manifest = built.manifest;
  if (
    !manifest.mediaPaths.includes("Media/Assets/Announcement.png") ||
    manifest.mediaPaths.includes("Media/Assets/Opener.mp4") ||
    !manifest.skippedMediaPaths.some((p) => p.includes("Opener.mp4"))
  ) {
    throw new Error(`expected image to win media budget before video, got ${JSON.stringify(manifest)}`);
  }
}

async function testBuildIncludesMediaWithCaps() {
  const mediaCommitPlan = {
    ...commitPlan,
    playlistPreview: [
      {
        position: 1,
        kind: "song_add" as const,
        name: "Old Hymn",
        source: "PCO",
        libraryMatch: {
          status: "found" as const,
          item: { id: "old", name: "Old Hymn", libraryId: "L", libraryName: "Default" },
          searchTerm: "Old Hymn",
        },
      },
    ],
  } satisfies MockCommitPlan;
  const filesById = new Map<string, Buffer>([
    ["b1", Buffer.from("Old Hymn\0SS_Watercolor_003b.mp4\0Huge Opener.mp4")],
    ["media-bg", Buffer.from("small-media")],
    ["media-bg-current", Buffer.from("wrong-duplicate")],
    ["media-huge", Buffer.from("large-media")],
  ]);
  const drive = {
    files: {
      get: async ({ fileId }: { fileId: string }) => ({
        data: filesById.get(fileId) ?? Buffer.alloc(0),
      }),
    },
  };

  const built = await buildFilebasePullZip({
    drive: drive as never,
    commitPlan: mediaCommitPlan,
    manifest: null,
    cloudLibraryIndex: [],
    snapshotFiles,
    mediaMaxFileBytes: 100,
    mediaMaxTotalBytes: 100,
  });
  const manifest = built.manifest;
  if (
    !manifest.mediaPaths.includes("Media/Assets/Backgrounds/SS_Watercolor_003b.mp4") ||
    manifest.mediaPaths.includes("Media/Assets/Current Files/SS_Watercolor_003b.mp4") ||
    !manifest.skippedMediaPaths.some((p) => p.includes("Huge Opener.mp4")) ||
    manifest.fileCount !== 2
  ) {
    throw new Error(`expected media included and oversized skipped, got ${JSON.stringify(manifest)}`);
  }
}

Promise.all([testBuildIncludesMediaWithCaps(), testBuildPrioritizesImagesOverVideosWithinMediaBudget()])
  .then(() => {
    console.log("filebase-pull tests ok");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
