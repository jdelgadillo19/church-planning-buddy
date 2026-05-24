import type { docs_v1 } from "googleapis";
import {
  GRG_PLACEHOLDER_DATE,
  GRG_PLACEHOLDER_SCANS_BEGIN,
  GRG_PLACEHOLDER_SONG_LIST,
} from "@/lib/config/grg";
import type { PlanRosterRow } from "@/lib/pco/plan-team";
import { applyRosterToDocument } from "./grg-roster";
import { appendScanSection, buildSongListLines, type SongListLine, type SongSectionInput } from "./grg-mutate";

function docEndIndex(doc: docs_v1.Schema$Document) {
  return doc.body?.content?.at(-1)?.endIndex ?? 1;
}

/** Find exact substring in body paragraphs; returns UTF-16 indices for batchUpdate. */
export function findTextRange(
  doc: docs_v1.Schema$Document,
  needle: string,
): { start: number; end: number } | null {
  for (const el of doc.body?.content ?? []) {
    const p = el.paragraph;
    if (!p || el.startIndex == null) continue;

    let text = "";
    for (const pe of p.elements ?? []) {
      text += pe.textRun?.content ?? "";
    }

    const idx = text.indexOf(needle);
    if (idx >= 0) {
      const start = el.startIndex + 1 + idx;
      const end = start + needle.length;
      return { start, end };
    }
  }

  return null;
}

async function deleteScansRegion(docs: docs_v1.Docs, documentId: string) {
  const doc = await docs.documents.get({ documentId });
  const body = doc.data;
  if (!body) throw new Error("Could not read document for scan region delete.");

  const marker = findTextRange(body, GRG_PLACEHOLDER_SCANS_BEGIN);
  if (!marker) {
    throw new Error(
      `Template marker ${GRG_PLACEHOLDER_SCANS_BEGIN} not found. See docs/GRG-TEMPLATE.md.`,
    );
  }

  const end = docEndIndex(body);
  if (end <= marker.start + 1) return;

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          deleteContentRange: {
            range: { startIndex: marker.start, endIndex: end - 1 },
          },
        },
      ],
    },
  });
}

export async function applyTemplateGrgUpdate(
  docs: docs_v1.Docs,
  documentId: string,
  input: {
    dateFormatted: string;
    songList: SongListLine[];
    sections: SongSectionInput[];
    roster?: PlanRosterRow[];
    skipIntro?: boolean;
    skipScans?: boolean;
  },
) {
  let requestCount = 0;

  if (!input.skipIntro) {
    const songBlock = buildSongListLines(input.songList).join("\n");
    const requests: docs_v1.Schema$Request[] = [
      {
        replaceAllText: {
          containsText: { text: GRG_PLACEHOLDER_DATE, matchCase: true },
          replaceText: input.dateFormatted,
        },
      },
      {
        replaceAllText: {
          containsText: { text: GRG_PLACEHOLDER_SONG_LIST, matchCase: true },
          replaceText: songBlock,
        },
      },
    ];

    const res = await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
    requestCount += res.data.replies?.length ?? requests.length;

    if (input.roster && input.roster.length > 0) {
      const rosterResult = await applyRosterToDocument(docs, documentId, input.roster);
      requestCount += rosterResult.updated;
    }
  }

  if (!input.skipScans) {
    await deleteScansRegion(docs, documentId);
    requestCount += 1;

    for (const section of input.sections) {
      await appendScanSection(docs, documentId, section, true);
      requestCount += 1;
    }
  }

  return { updated: requestCount > 0, requestCount };
}
