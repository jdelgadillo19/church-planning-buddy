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

const gratitudeIndex: PpLibraryItemRef[] = [
  { id: "de-en", name: "(DE + EN) Gratitude", libraryId: "1", libraryName: "Songs" },
  { id: "en", name: "(EN) Gratitude", libraryId: "1", libraryName: "Songs" },
];

{
  const result = matchLibraryItem("Gratitude", gratitudeIndex);
  if (result.status !== "ambiguous") {
    throw new Error(`expected ambiguous for Gratitude, got ${result.status}`);
  }
  if ((result.candidates?.length ?? 0) !== 2) {
    throw new Error(`expected 2 gratitude candidates, got ${result.candidates?.length}`);
  }
}

{
  const result = matchLibraryItem("(EN) Gratitude", gratitudeIndex);
  if (result.status !== "found") {
    throw new Error(`expected found for (EN) Gratitude, got ${result.status}`);
  }
  if (result.item?.id !== "en") {
    throw new Error(`expected en variant, got ${result.item?.id}`);
  }
}

console.log("library-read tests ok");
