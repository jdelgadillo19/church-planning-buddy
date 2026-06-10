import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";
import { librarySelectionForRow } from "./plan-element-key";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import {
  findTemplateItemForName,
  libraryItemToWritePayload,
  putPlaylistItems,
  resolveTargetPlaylist,
  templateItemToWritePayload,
  type PlaylistResolution,
  type PpWritePlaylistItem,
} from "@/lib/propresenter/playlist-write";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import {
  allowPartialApply,
  comparePlaylistToExpected,
  expectedNamesFromWriteItems,
  resolveApplyPollIntervalMs,
  resolveApplyVerifyTimeoutMs,
} from "./playlist-match";

export type ApplyCommitResult = {
  ok: true;
  playlistId: string;
  playlistName: string;
  itemCount: number;
  items: { position: number; name: string; kind: MockCommitPlaylistRow["kind"] }[];
  warnings: string[];
};

export type ApplyCommitInput = {
  commitPlan: MockCommitPlan;
  templateItems: PpPlaylistItemRef[];
  libraryIndex: PpLibraryItemRef[];
  playlistResolution?: PlaylistResolution;
  /** Playlist preview row position → ProPresenter library item id */
  librarySelections?: Record<string, string>;
};

function resolveLibraryItemForRow(
  row: MockCommitPlaylistRow,
  libraryIndex: PpLibraryItemRef[],
  librarySelections?: Record<string, string>,
): PpLibraryItemRef | undefined {
  const elementKey = row.elementKey;
  const overrideId = elementKey
    ? librarySelectionForRow(elementKey, row, librarySelections ?? {})
    : librarySelections?.[String(row.position)];
  if (overrideId) {
    const fromOverride = libraryIndex.find((item) => item.id === overrideId);
    if (fromOverride) return fromOverride;
    if (row.libraryMatch?.status === "found" && row.libraryMatch.item?.id === overrideId) {
      return row.libraryMatch.item;
    }
    if (row.libraryMatch?.status === "ambiguous") {
      return row.libraryMatch.candidates?.find((c) => c.id === overrideId);
    }
  }
  if (row.libraryMatch?.status === "found" && row.libraryMatch.item) {
    return row.libraryMatch.item;
  }
  return undefined;
}

export function buildWriteItemsFromPreview(input: ApplyCommitInput): {
  items: PpWritePlaylistItem[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const items: PpWritePlaylistItem[] = [];
  const partial = allowPartialApply();
  const skippedSongs: string[] = [];

  for (const row of input.commitPlan.playlistPreview) {
    if (row.kind === "template_inherit") {
      const templateRef = findTemplateItemForName(input.templateItems, row.name);
      if (!templateRef) {
        const msg = `Template item "${row.name}" not found in source template — skipped.`;
        if (!partial) {
          throw new Error(`Cannot apply: ${msg}`);
        }
        warnings.push(msg);
        continue;
      }
      items.push(templateItemToWritePayload(templateRef, items.length));
      continue;
    }

    const match = resolveLibraryItemForRow(row, input.libraryIndex, input.librarySelections);
    if (!match) {
      const label = row.pcoTitle ?? row.name;
      const reason =
        row.libraryMatch?.status === "ambiguous"
          ? "ambiguous library match (no variant selected)"
          : "no library match";
      if (!partial) {
        throw new Error(
          `Cannot apply: Song "${label}" has ${reason}. Add it to the ProPresenter library, run Scan now on the rig, refresh the preview, then send again.`,
        );
      }
      skippedSongs.push(label);
      warnings.push(`Song "${label}" has ${reason} — skipped in live apply.`);
      continue;
    }

    items.push(libraryItemToWritePayload(match, items.length));
  }

  if (items.length === 0) {
    const detail =
      warnings.length > 0
        ? ` Details: ${warnings.join(" ")}`
        : " Run Scan now on the rig, refresh the preview on grapevineprep.com, resolve any song/library warnings, then send a new build.";
    throw new Error(
      `No playlist items to write after resolving template and library matches.${detail}`,
    );
  }

  if (skippedSongs.length > 0) {
    warnings.push(
      `Partial apply: skipped ${skippedSongs.length} song(s): ${skippedSongs.join(", ")}.`,
    );
  }

  return { items, warnings };
}

function mapWrittenItems(
  written: PpPlaylistItemRef[],
  previewRows: MockCommitPlaylistRow[],
): ApplyCommitResult["items"] {
  return written.map((item, index) => {
    const previewRow = previewRows[index];
    return {
      position: index + 1,
      name: item.name,
      kind: previewRow?.kind ?? "song_add",
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll ProPresenter until playlist matches expected written names or timeout. */
export async function waitForPlaylistMatch(
  playlistId: string,
  expectedNames: string[],
): Promise<{ items: PpPlaylistItemRef[]; warnings: string[] }> {
  const warnings: string[] = [];
  const deadline = Date.now() + resolveApplyVerifyTimeoutMs();
  const interval = resolveApplyPollIntervalMs();
  let lastDiff: string[] = [];

  while (Date.now() < deadline) {
    const written = await getPlaylistItems(playlistId);
    const { matched, differences } = comparePlaylistToExpected(expectedNames, written);
    if (matched) {
      return { items: written, warnings };
    }
    lastDiff = differences;
    await sleep(interval);
  }

  const final = await getPlaylistItems(playlistId);
  const { matched, differences } = comparePlaylistToExpected(expectedNames, final);
  if (matched) {
    return { items: final, warnings };
  }

  throw new Error(
    `Playlist did not match written items within ${resolveApplyVerifyTimeoutMs()}ms. ${[...differences, ...lastDiff].slice(0, 5).join(" ")}`,
  );
}

/** Live apply: create playlist + PUT ordered items. Requires PP_ALLOW_WRITES=true. */
export async function applyCommitPlan(input: ApplyCommitInput): Promise<ApplyCommitResult> {
  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    throw new Error("ProPresenter writes disabled. Set PP_ALLOW_WRITES=true in .env.local.");
  }

  const { items, warnings } = buildWriteItemsFromPreview(input);
  const expectedNames = expectedNamesFromWriteItems(items);

  const created = await resolveTargetPlaylist(
    input.commitPlan.playlistName,
    input.playlistResolution ?? "reuse_empty",
    config,
  );

  try {
    await putPlaylistItems(created.id, items, config);
  } catch (e) {
    warnings.push(
      `PUT may have timed out — checking playlist "${created.name}" until it matches written items.`,
    );
    if (e instanceof Error && !/timeout/i.test(e.message)) throw e;
  }

  const { items: written, warnings: pollWarnings } = await waitForPlaylistMatch(
    created.id,
    expectedNames,
  );
  warnings.push(...pollWarnings);

  const previewRowsForMap = allowPartialApply()
    ? input.commitPlan.playlistPreview.filter((row) => {
        if (row.kind === "template_inherit") {
          return findTemplateItemForName(input.templateItems, row.name) !== undefined;
        }
        return resolveLibraryItemForRow(row, input.libraryIndex, input.librarySelections) !== undefined;
      })
    : input.commitPlan.playlistPreview;

  return {
    ok: true,
    playlistId: created.id,
    playlistName: created.name,
    itemCount: written.length,
    items: mapWrittenItems(written, previewRowsForMap),
    warnings,
  };
}
