import { filenameHasKeySignature, pickClearFrontrunner, scoreScanFilename } from "./priority";

if (filenameHasKeySignature("Peace Be Still (Song Scan LF)")) {
  throw new Error("Peace Be Still should not have key signature");
}
if (!filenameHasKeySignature("Amazing Grace - Key of Ab")) {
  throw new Error("expected Key of Ab to detect key");
}
if (!filenameHasKeySignature("Worship Song in Bb")) {
  throw new Error("expected in Bb to detect key");
}

{
  const a = { id: "a", name: "Peace Be Still Song Scan", score: scoreScanFilename("Peace Be Still Song Scan") };
  const b = { id: "b", name: "Peace Be Still (Key of C)", score: scoreScanFilename("Peace Be Still (Key of C)") };
  if (a.score <= b.score) throw new Error("non-key file should score higher");
  const pick = pickClearFrontrunner([a, b]);
  if (!pick || pick.id !== "a") throw new Error("expected clear frontrunner without key");
}

{
  const tie = pickClearFrontrunner([
    { id: "1", score: 50 },
    { id: "2", score: 50 },
  ]);
  if (tie !== null) throw new Error("expected null on tie");
}

console.log("priority tests ok");
