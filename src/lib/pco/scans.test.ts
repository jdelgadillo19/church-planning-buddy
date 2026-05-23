import {
  attachmentName,
  classifyAttachmentTier,
  isMasterScanName,
  isSongScanCandidateName,
  pickBestScanAttachment,
  type PcoAttachment,
} from "./scans";

function att(id: string, name: string, extra?: Partial<PcoAttachment>): PcoAttachment {
  return {
    id,
    attributes: { display_name: name },
    ...extra,
  };
}

// Peace Be Still: incidental song scan before true MASTER alias
{
  const attachments = [
    att("1", "Peace Be Still (Song Scan LF January 2023)"),
    att("2", "Peace Be Still (Resources) Song Scan MASTER - alias", {
      sourceArrangementId: "arr-1",
      attributes: {
        display_name: "Peace Be Still (Resources) Song Scan MASTER - alias",
        linked_url: "https://drive.google.com/file/d/MASTER/view",
      },
    }),
  ];
  const pick = pickBestScanAttachment(attachments, "arr-1");
  if (!pick || pick.tier !== "green" || pick.attachmentId !== "2") {
    throw new Error(`expected MASTER pick, got ${JSON.stringify(pick)}`);
  }
}

// MASTER without strict prefix but with (MASTER) in name
{
  if (!isMasterScanName("My Song (Song Scan MASTER)")) {
    throw new Error("expected (MASTER) variant to count as master");
  }
  if (classifyAttachmentTier("Some Song Scan file") !== "yellow") {
    throw new Error("expected plain song scan to be yellow");
  }
}

// No MASTER anywhere → first yellow by preference (arrangement + drive url)
{
  const attachments = [
    att("a", "Shout To The Lord Song Scan", {
      attributes: { display_name: "Shout To The Lord Song Scan" },
    }),
    att("b", "Shout To The Lord (Song Scan LF August 20)", {
      sourceArrangementId: "arr-2",
      attributes: {
        display_name: "Shout To The Lord (Song Scan LF August 20)",
        linked_url: "https://drive.google.com/file/d/YELLOW/view",
      },
    }),
  ];
  const pick = pickBestScanAttachment(attachments, "arr-2");
  if (!pick || pick.tier !== "yellow" || pick.attachmentId !== "b") {
    throw new Error(`expected arrangement yellow pick, got ${JSON.stringify(pick)}`);
  }
}

// Only non-scan attachments → null
{
  const pick = pickBestScanAttachment([att("x", "Chord Chart PDF")]);
  if (pick !== null) throw new Error("expected null for non-scan attachments");
}

// Strict green prefix
{
  const pick = pickBestScanAttachment([
    att("g", "(Resources) Song Scan MASTER - Blank Folder"),
  ]);
  if (!pick || pick.tier !== "green") throw new Error("expected green for MASTER prefix");
}

if (!isSongScanCandidateName("Worship Song Scan Notes")) {
  throw new Error("expected song scan candidate");
}

console.log("scans tests ok");
