import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";
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
  comparePlaylistToExpected,
  expectedNamesFromCommitPlan,
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
  const overrideId = librarySelections?.[String(row.position)];
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

  for (const row of input.commitPlan.playlistPreview) {
    if (row.kind === "template_inherit") {
      const templateRef = findTemplateItemForName(input.templateItems, row.name);
      if (!templateRef) {
        warnings.push(`Template item "${row.name}" not found in source template — skipped.`);
        continue;
      }
      items.push(templateItemToWritePayload(templateRef, items.length));
      continue;
    }

    const match = resolveLibraryItemForRow(row, input.libraryIndex, input.librarySelections);
    if (!match) {
      const reason =
        row.libraryMatch?.status === "ambiguous"
          ? "ambiguous library match (no variant selected)"
          : "no library match";
      warnings.push(`Song "${row.pcoTitle ?? row.name}" has ${reason} — skipped in live apply.`);
      continue;
    }

    items.push(libraryItemToWritePayload(match, items.length));
  }

  if (items.length === 0) {
    throw new Error("No playlist items to write after resolving template and library matches.");
  }

  return { items, warnings };
}

function mapWrittenItems(
  written: PpPlaylistItemRef[],
  commitPlan: MockCommitPlan,
): ApplyCommitResult["items"] {
  return written.map((item, index) => {
    const previewRow = commitPlan.playlistPreview[index];
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

/** Poll ProPresenter until playlist matches commit preview or timeout. */
export async function waitForPlaylistMatch(
  playlistId: string,
  commitPlan: MockCommitPlan,
): Promise<{ items: PpPlaylistItemRef[]; warnings: string[] }> {
  const expected = expectedNamesFromCommitPlan(commitPlan);
  const warnings: string[] = [];
  const deadline = Date.now() + resolveApplyVerifyTimeoutMs();
  const interval = resolveApplyPollIntervalMs();
  let lastDiff: string[] = [];

  while (Date.now() < deadline) {
    const written = await getPlaylistItems(playlistId);
    const { matched, differences } = comparePlaylistToExpected(expected, written);
    if (matched) {
      return { items: written, warnings };
    }
    lastDiff = differences;
    await sleep(interval);
  }

  const final = await getPlaylistItems(playlistId);
  const { matched, differences } = comparePlaylistToExpected(expected, final);
  if (matched) {
    return { items: final, warnings };
  }

  throw new Error(
    `Playlist did not match commit preview within ${resolveApplyVerifyTimeoutMs()}ms. ${[...differences, ...lastDiff].slice(0, 5).join(" ")}`,
  );
}

/** Live apply: create playlist + PUT ordered items. Requires PP_ALLOW_WRITES=true. */
export async function applyCommitPlan(input: ApplyCommitInput): Promise<ApplyCommitResult> {
  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    throw new Error("ProPresenter writes disabled. Set PP_ALLOW_WRITES=true in .env.local.");
  }

  const { items, warnings } = buildWriteItemsFromPreview(input);

  const created = await resolveTargetPlaylist(
    input.commitPlan.playlistName,
    input.playlistResolution ?? "reuse_empty",
    config,
  );

  try {
    await putPlaylistItems(created.id, items, config);
  } catch (e) {
    warnings.push(
      `PUT may have timed out — checking playlist "${created.name}" until it matches preview.`,
    );
    if (e instanceof Error && !/timeout/i.test(e.message)) throw e;
  }

  const { items: written, warnings: pollWarnings } = await waitForPlaylistMatch(
    created.id,
    input.commitPlan,
  );
  warnings.push(...pollWarnings);

  return {
    ok: true,
    playlistId: created.id,
    playlistName: created.name,
    itemCount: written.length,
    items: mapWrittenItems(written, input.commitPlan),
    warnings,
  };
}
