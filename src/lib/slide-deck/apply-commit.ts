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
import { matchLibraryItem } from "@/lib/propresenter/library-read";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { loadProPresenterConfig } from "@/lib/propresenter/config";
import { isProPresenterApiError } from "@/lib/propresenter/client";
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
  /** Remote prep: items already verified against live ProPresenter */
  prebuiltWriteItems?: PpWritePlaylistItem[];
  prebuiltWarnings?: string[];
};

export function remapLibrarySelectionsToLive(
  selections: Record<string, string>,
  commitPlan: MockCommitPlan,
  liveIndex: PpLibraryItemRef[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [position, selectedId] of Object.entries(selections)) {
    if (liveIndex.some((item) => item.id === selectedId)) {
      out[position] = selectedId;
      continue;
    }
    const row = commitPlan.playlistPreview.find((r) => String(r.position) === position);
    const label = row?.pcoTitle ?? row?.name ?? "";
    if (!label) {
      out[position] = selectedId;
      continue;
    }
    const cloudCandidate = row?.libraryMatch?.candidates?.find((c) => c.id === selectedId);
    const searchName = cloudCandidate?.name ?? label;
    const match = matchLibraryItem(searchName, liveIndex);
    if (match.status === "found" && match.item) {
      out[position] = match.item.id;
      continue;
    }
    if (match.status === "ambiguous") {
      const picked =
        match.candidates?.find((c) => c.name === cloudCandidate?.name) ?? match.candidates?.[0];
      out[position] = picked?.id ?? selectedId;
      continue;
    }
    out[position] = selectedId;
  }
  return out;
}

export function resolveLibraryItemForRow(
  row: MockCommitPlaylistRow,
  libraryIndex: PpLibraryItemRef[],
  librarySelections?: Record<string, string>,
): PpLibraryItemRef | undefined {
  const label = row.pcoTitle ?? row.name;
  const elementKey = row.elementKey;
  const overrideId = elementKey
    ? librarySelectionForRow(elementKey, row, librarySelections ?? {})
    : librarySelections?.[String(row.position)];

  if (overrideId) {
    const fromOverride = libraryIndex.find((item) => item.id === overrideId);
    if (fromOverride) return fromOverride;

    const cloudCandidate =
      row.libraryMatch?.candidates?.find((c) => c.id === overrideId) ??
      (row.libraryMatch?.item?.id === overrideId ? row.libraryMatch.item : undefined);
    const searchName = cloudCandidate?.name ?? label;
    const remapped = matchLibraryItem(searchName, libraryIndex);
    if (remapped.status === "found") return remapped.item;
    if (remapped.status === "ambiguous") {
      const fromAmbiguous = remapped.candidates?.find((c) => c.id === overrideId);
      if (fromAmbiguous) return fromAmbiguous;
      return remapped.candidates?.[0];
    }
  }

  const byName = matchLibraryItem(label, libraryIndex);
  if (byName.status === "found") return byName.item;

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
      const templateRef =
        input.templateItems.length > 0
          ? findTemplateItemForName(input.templateItems, row.name)
          : undefined;
      if (templateRef) {
        items.push(templateItemToWritePayload(templateRef, items.length));
        continue;
      }

      const libraryFallback = resolveLibraryItemForRow(
        row,
        input.libraryIndex,
        input.librarySelections,
      );
      const byNameMatch = matchLibraryItem(row.pcoTitle ?? row.name, input.libraryIndex);
      const byName =
        libraryFallback ?? (byNameMatch.status === "found" ? byNameMatch.item : undefined);
      if (byName) {
        items.push(libraryItemToWritePayload(byName, items.length));
        continue;
      }

      const msg = `Service item "${row.name}" not found in library — skipped.`;
      if (!partial) {
        throw new Error(`Cannot apply: ${msg}`);
      }
      warnings.push(msg);
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

  const { items, warnings } = input.prebuiltWriteItems
    ? {
        items: input.prebuiltWriteItems,
        warnings: input.prebuiltWarnings ?? [],
      }
    : buildWriteItemsFromPreview(input);
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
    if (isProPresenterApiError(e)) {
      const status = e.status ? ` (${e.status})` : "";
      const path = e.path ? ` ${e.path}` : "";
      throw new Error(
        `ProPresenter PUT v1/playlist/${created.id} failed${status}${path}: ${e.message}`,
      );
    }
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
