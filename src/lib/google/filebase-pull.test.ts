import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import {
  findSnapshotPathsForSong,
  resolveFilebasePathsForPlan,
} from "./filebase-pull";

const snapshotFiles = [
  { relativePath: "Libraries/Default/Amazing Grace.proBundle/data.json", driveFileId: "a1" },
  { relativePath: "Libraries/Default/Amazing Grace.proBundle/slides.bin", driveFileId: "a2" },
  { relativePath: "Libraries/Default/Old Hymn.pro", driveFileId: "b1" },
  { relativePath: "Playlists/Sundays Template.proplaylist", driveFileId: "t1" },
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
  if (paths.length !== 2) {
    throw new Error(`expected 2 song paths, got ${JSON.stringify(paths)}`);
  }
}

console.log("filebase-pull tests ok");
