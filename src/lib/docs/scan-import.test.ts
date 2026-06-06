import {
  classifyLyricLines,
  extractSections,
  parseSourceDocument,
  pushColumns,
  splitScanParagraphs,
} from "./scan-import";
import { buildSongListLines, stripArrangementPrefix } from "./grg-mutate";
import type { docs_v1 } from "@/lib/google/api-types";

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

// Underscore separator is recognized as the header/lyrics boundary.
{
  const paragraphs = [
    { runs: [{ text: "Washed\n" }] },
    { runs: [{ text: "By: Someone\n" }] },
    { runs: [{ text: "CCLI Song #1\n" }] },
    { runs: [{ text: "________________\n" }] },
    { runs: [{ text: "8 Bar Intro\n" }] },
    { runs: [{ text: "I'm clean\n" }] },
  ];
  const { header, lyrics } = splitScanParagraphs(paragraphs);
  // header includes through the underscore divider; lyrics begin after it.
  if (header.length !== 4) throw new Error(`expected 4 header paras, got ${header.length}`);
  if (lyrics[0].runs[0].text.trim() !== "8 Bar Intro") {
    throw new Error("lyrics should start at the bar marker after the underscore divider");
  }
}

// Song list: space after colon + arrangement-code prefix stripped.
{
  if (stripArrangementPrefix("XX - Elevation Rhythm") !== "Elevation Rhythm") {
    throw new Error("should strip 'XX - ' arrangement prefix");
  }
  if (stripArrangementPrefix("XX - The Belonging Co") !== "The Belonging Co") {
    throw new Error("should strip prefix before multi-word band");
  }
  if (stripArrangementPrefix("Elevation Worship") !== "Elevation Worship") {
    throw new Error("should not strip when there is no short-code prefix");
  }
  const [line] = buildSongListLines([{ title: "Washed", key: "C", artist: "XX - Elevation Rhythm" }]);
  if (line !== "Key of C: Washed - Elevation Rhythm") {
    throw new Error(`unexpected song list line: ${line}`);
  }
}

// Lyrics classification no longer appends a literal "END" sentinel line.
{
  const lyrics = [
    { runs: [{ text: "8 Bar Intro\n" }] },
    { runs: [{ text: "VERSE 1:\n" }] },
    { runs: [{ text: "Last lyric line\n" }] },
  ];
  const classified = classifyLyricLines(lyrics);
  if (classified.some((l) => l.text === "END")) {
    throw new Error("classifyLyricLines must not inject an END sentinel");
  }
  if (classified[classified.length - 1].text !== "Last lyric line") {
    throw new Error("last lyric line should be the real final line");
  }
}

// Internal blank lines survive (each is a ProPresenter slide break); leading and
// trailing blanks are trimmed.
{
  const lyrics = [
    { runs: [{ text: "\n" }] },
    { runs: [{ text: "VERSE 1:\n" }] },
    { runs: [{ text: "first line\n" }] },
    { runs: [{ text: "\n" }] },
    { runs: [{ text: "second line\n" }] },
    { runs: [{ text: "\n" }] },
  ];
  const classified = classifyLyricLines(lyrics);
  const texts = classified.map((l) => l.text);
  if (texts[0] !== "VERSE 1:") {
    throw new Error(`leading blank not trimmed: ${JSON.stringify(texts)}`);
  }
  if (texts[texts.length - 1] !== "second line") {
    throw new Error(`trailing blank not trimmed: ${JSON.stringify(texts)}`);
  }
  if (!texts.includes("")) {
    throw new Error(`internal blank line must be preserved: ${JSON.stringify(texts)}`);
  }
}

// The song-ending "END" marker is styled like a bar marker, not a plain lyric.
{
  const classified = classifyLyricLines([{ runs: [{ text: "END\n" }] }]);
  if (classified[0]?.type !== "bar") {
    throw new Error(`END should classify as bar, got ${classified[0]?.type}`);
  }
}

// updateSectionStyle range must come from the section-break element indices,
// not paragraph bounds (a mid-section range is rejected by the Docs API).
{
  const doc: docs_v1.Schema$Document = {
    body: {
      content: [
        { sectionBreak: {}, startIndex: 0, endIndex: 1 },
        { startIndex: 1, endIndex: 8, paragraph: para("Header") },
        { sectionBreak: {}, startIndex: 8, endIndex: 9 },
        { startIndex: 9, endIndex: 20, paragraph: para("Lyric") },
      ],
    },
  };
  const sections = extractSections(doc);
  if (sections.length !== 2) throw new Error(`expected 2 sections, got ${sections.length}`);
  const lyricsSection = sections[1];
  if (lyricsSection.breakStart !== 8 || lyricsSection.breakEnd !== 9) {
    throw new Error("section break indices not captured");
  }
  const requests: docs_v1.Schema$Request[] = [];
  pushColumns(requests, lyricsSection, [
    { width: { magnitude: 234, unit: "PT" }, paddingEnd: { magnitude: 18, unit: "PT" } },
    { width: { magnitude: 234, unit: "PT" } },
  ]);
  const range = requests[0]?.updateSectionStyle?.range;
  if (!range || range.startIndex !== 8 || range.endIndex !== 9) {
    throw new Error(`updateSectionStyle range should be the break range, got ${JSON.stringify(range)}`);
  }
  // Widths must be stripped (Docs rejects them); count + paddingEnd preserved.
  const emitted = requests[0]?.updateSectionStyle?.sectionStyle?.columnProperties;
  if (!emitted || emitted.length !== 2) {
    throw new Error(`expected 2 column entries, got ${JSON.stringify(emitted)}`);
  }
  if (emitted.some((c) => c.width != null)) {
    throw new Error(`columnProperties must not contain width: ${JSON.stringify(emitted)}`);
  }
  if (emitted[0].paddingEnd?.magnitude !== 18) {
    throw new Error("paddingEnd should be preserved on the first column");
  }
}

console.log("scan-import tests ok");
