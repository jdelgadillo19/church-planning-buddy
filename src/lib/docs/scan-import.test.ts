import { parseSourceDocument, splitScanParagraphs } from "./scan-import";
import type { docs_v1 } from "googleapis";

function para(text: string): docs_v1.Schema$Paragraph {
  return {
    elements: [{ textRun: { content: `${text}\n` } }],
  };
}

function docWithParagraphs(texts: string[]): docs_v1.Schema$Document {
  return {
    body: {
      content: texts.map((t, i) => ({
        startIndex: i * 100,
        endIndex: (i + 1) * 100,
        paragraph: para(t),
      })),
    },
  };
}

{
  const paragraphs = [
    { runs: [{ text: "Song Title\n" }] },
    { runs: [{ text: "CCLI #123\n" }] },
    { runs: [{ text: "――――――――\n" }] },
    { runs: [{ text: "VERSE 1:\n" }] },
    { runs: [{ text: "Lyrics line\n" }] },
  ];
  const { header, lyrics } = splitScanParagraphs(paragraphs);
  if (header.length !== 3) throw new Error(`expected 3 header paras, got ${header.length}`);
  if (lyrics.length !== 2) throw new Error(`expected 2 lyrics paras, got ${lyrics.length}`);
}

{
  const doc = docWithParagraphs([
    "Peace Be Still",
    "CCLI Song #1",
    "――――――――――――",
    "VERSE 1: Lead",
    "Line one",
  ]);
  const { header, lyrics } = parseSourceDocument(doc);
  if (header.length < 2) throw new Error("header should include through rule");
  if (lyrics.length < 1) throw new Error("lyrics should start at VERSE");
}

console.log("scan-import tests ok");
