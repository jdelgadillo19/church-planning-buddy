import type { docs_v1 } from "googleapis";

export type SongListLine = {
  title: string;
  key: string;
  artist: string;
};

export type SongSectionInput = {
  title: string;
  bodyText: string;
};

type TextRun = { start: number; end: number; text: string };

const MONTH_DATE =
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4}/i;

function collectParagraphTexts(doc: docs_v1.Schema$Document): TextRun[] {
  const runs: TextRun[] = [];
  const content = doc.body?.content ?? [];

  for (const el of content) {
    const p = el.paragraph;
    if (!p || el.startIndex == null || el.endIndex == null) continue;

    let text = "";
    for (const pe of p.elements ?? []) {
      text += pe.textRun?.content ?? "";
    }
    runs.push({ start: el.startIndex, end: el.endIndex, text });
  }

  return runs;
}

function docEndIndex(doc: docs_v1.Schema$Document) {
  return doc.body?.content?.at(-1)?.endIndex ?? 1;
}

function findDateReplaceRange(runs: TextRun[]): { start: number; end: number } | null {
  for (const r of runs) {
    if (MONTH_DATE.test(r.text.trim())) {
      const innerStart = r.start + 1;
      const innerEnd = r.end - 1;
      if (innerEnd > innerStart) return { start: innerStart, end: innerEnd };
    }
  }

  const guideIdx = runs.findIndex((r) => /get ready guide/i.test(r.text));
  if (guideIdx >= 0 && runs[guideIdx + 1]) {
    const r = runs[guideIdx + 1];
    const innerStart = r.start + 1;
    const innerEnd = r.end - 1;
    if (innerEnd > innerStart) return { start: innerStart, end: innerEnd };
  }

  return null;
}

function findIntroEndIndex(doc: docs_v1.Schema$Document, listRuns: TextRun[]): number {
  if (listRuns.length === 0) return 1;

  const lastList = listRuns[listRuns.length - 1];
  const content = doc.body?.content ?? [];

  for (const el of content) {
    if (el.startIndex == null || el.startIndex < lastList.end) continue;
    if (el.sectionBreak) return el.startIndex;
  }

  return lastList.end;
}

export function buildSongListLines(songs: SongListLine[]) {
  return songs.map((s) => {
    const artist = s.artist.trim() ? ` - ${s.artist.trim()}` : "";
    const key = s.key.trim() ? s.key.trim() : "?";
    return `Key of ${key}: ${s.title.trim()}${artist}`;
  });
}

export function findIntroMutationRanges(doc: docs_v1.Schema$Document, newDate: string, songLines: string[]) {
  const runs = collectParagraphTexts(doc);
  const requests: docs_v1.Schema$Request[] = [];

  const dateRange = findDateReplaceRange(runs);
  if (dateRange && newDate && dateRange.end > dateRange.start) {
    requests.push({
      deleteContentRange: { range: { startIndex: dateRange.start, endIndex: dateRange.end } },
    });
    requests.push({ insertText: { location: { index: dateRange.start }, text: newDate } });
  }

  const songListIdx = runs.findIndex((r) => r.text.trim().toLowerCase().startsWith("song list"));
  if (songListIdx === -1) {
    return { requests, introEndIndex: null as number | null, warning: "Song List header not found." };
  }

  const listRuns: TextRun[] = [];
  for (let i = songListIdx + 1; i < runs.length; i++) {
    const t = runs[i].text.trim();
    if (!t) continue;
    if (/^key of /i.test(t)) {
      listRuns.push(runs[i]);
      continue;
    }
    break;
  }

  if (listRuns.length === 0) {
    return { requests, introEndIndex: null, warning: "No Key of … lines found under Song List." };
  }

  const newBlock = `${songLines.join("\n")}\n`;
  const first = listRuns[0];
  const last = listRuns[listRuns.length - 1];
  const replaceStart = first.start;
  const replaceEnd = last.end - 1;

  if (replaceEnd > replaceStart) {
    requests.push({ deleteContentRange: { range: { startIndex: replaceStart, endIndex: replaceEnd } } });
    requests.push({ insertText: { location: { index: replaceStart }, text: newBlock } });
  }

  const introEndIndex = findIntroEndIndex(doc, listRuns);

  return {
    requests,
    introEndIndex,
    docEndIndex: docEndIndex(doc),
    warning: undefined as string | undefined,
  };
}

async function deletePostIntroContent(
  docs: docs_v1.Docs,
  documentId: string,
  introEndIndex: number,
) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) return;

  const end = docEndIndex(body);
  if (end > introEndIndex + 1) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            deleteContentRange: {
              range: { startIndex: introEndIndex, endIndex: end - 1 },
            },
          },
        ],
      },
    });
  }
}

/** Append one scan section at document end — separate batch avoids index drift errors. */
export async function appendScanSection(
  docs: docs_v1.Docs,
  documentId: string,
  section: SongSectionInput,
  addPageBreak: boolean,
) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) throw new Error("Could not read document for scan insert.");

  const insertAt = docEndIndex(body) - 1;
  const title = `${section.title.trim()}\n`;
  const rule = "――――――――――――――――――――\n";
  const bodyText = `${section.bodyText.trim()}\n\n`;

  const requests: docs_v1.Schema$Request[] = [];

  if (addPageBreak) {
    requests.push({ insertPageBreak: { location: { index: insertAt } } });
  }

  const textStart = addPageBreak ? insertAt + 1 : insertAt;
  const block = `${title}${rule}${bodyText}`;
  requests.push({ insertText: { location: { index: textStart }, text: block } });

  const titleStart = textStart;
  const titleEnd = textStart + title.length;

  requests.push({
    updateParagraphStyle: {
      range: { startIndex: titleStart, endIndex: titleEnd },
      paragraphStyle: { namedStyleType: "HEADING_1" },
      fields: "namedStyleType",
    },
  });
  requests.push({
    updateTextStyle: {
      range: { startIndex: titleStart, endIndex: titleEnd - 1 },
      textStyle: { bold: true },
      fields: "bold",
    },
  });

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

export async function applyGrgUpdate(
  docs: docs_v1.Docs,
  documentId: string,
  input: {
    dateFormatted: string;
    songList: SongListLine[];
    sections: SongSectionInput[];
    skipIntro?: boolean;
    skipScans?: boolean;
  },
) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) throw new Error("Could not load GRG document.");

  let requestCount = 0;
  let introEndIndex = 1;

  if (!input.skipIntro) {
    const intro = findIntroMutationRanges(body, input.dateFormatted, buildSongListLines(input.songList));
    if (intro.warning) throw new Error(intro.warning);
    if (intro.introEndIndex == null) throw new Error("Could not locate intro end.");
    introEndIndex = intro.introEndIndex;

    if (intro.requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests: intro.requests },
      });
      requestCount += intro.requests.length;
    }

    const afterIntro = await docs.documents.get({ documentId });
    const afterBody = afterIntro.data;
    if (afterBody) {
      const refreshed = findIntroMutationRanges(
        afterBody,
        input.dateFormatted,
        buildSongListLines(input.songList),
      );
      if (refreshed.introEndIndex != null) introEndIndex = refreshed.introEndIndex;
    }
  }

  if (!input.skipScans && input.sections.length > 0) {
    await deletePostIntroContent(docs, documentId, introEndIndex);

    for (const section of input.sections) {
      await appendScanSection(docs, documentId, section, true);
      requestCount += 1;
    }
  }

  return { updated: requestCount > 0, requestCount };
}
