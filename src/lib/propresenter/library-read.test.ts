import { matchLibraryItem, type PpLibraryItemRef } from "./library-read";

const index: PpLibraryItemRef[] = [
  { id: "a", name: "Holy Forever EN", libraryId: "1", libraryName: "Songs" },
  { id: "b", name: "Holy Forever DE", libraryId: "1", libraryName: "Songs" },
  { id: "c", name: "Peace Be Still", libraryId: "1", libraryName: "Songs" },
];

{
  const result = matchLibraryItem("Holy Forever", index);
  if (result.status !== "ambiguous") throw new Error(`expected ambiguous, got ${result.status}`);
  if ((result.candidates?.length ?? 0) !== 2) {
    throw new Error(`expected 2 candidates, got ${result.candidates?.length}`);
  }
}

{
  const result = matchLibraryItem("Peace Be Still", index);
  if (result.status !== "found") throw new Error(`expected found, got ${result.status}`);
  if (result.item?.id !== "c") throw new Error(`expected item c, got ${result.item?.id}`);
}

console.log("library-read tests ok");
