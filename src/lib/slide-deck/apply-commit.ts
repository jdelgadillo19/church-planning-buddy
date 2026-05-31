import type { MockCommitPlan, MockCommitPlaylistRow } from "./mock-commit";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import {
  createOrReuseEmptyPlaylist,
  findTemplateItemForName,
  libraryItemToWritePayload,
  putPlaylistItems,
  templateItemToWritePayload,
  type PpWritePlaylistItem,
} from "@/lib/propresenter/playlist-write";
import { getPlaylistItems } from "@/lib/propresenter/playlist-read";
import { loadProPresenterConfig } from "@/lib/propresenter/config";

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
};

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

    const match = row.libraryMatch?.item;
    if (!match || row.libraryMatch?.status !== "found") {
      warnings.push(
        `Song "${row.pcoTitle ?? row.name}" has no library match — skipped in live apply.`,
      );
      continue;
    }

    items.push(libraryItemToWritePayload(match, items.length));
  }

  if (items.length === 0) {
    throw new Error("No playlist items to write after resolving template and library matches.");
  }

  return { items, warnings };
}

/** Live apply: create playlist + PUT ordered items. Requires PP_ALLOW_WRITES=true. */
export async function applyCommitPlan(input: ApplyCommitInput): Promise<ApplyCommitResult> {
  const config = loadProPresenterConfig();
  if (!config.allowWrites) {
    throw new Error("ProPresenter writes disabled. Set PP_ALLOW_WRITES=true in .env.local.");
  }

  const { items, warnings } = buildWriteItemsFromPreview(input);

  const created = await createOrReuseEmptyPlaylist(input.commitPlan.playlistName, config);

  try {
    await putPlaylistItems(created.id, items, config);
  } catch (e) {
    warnings.push(
      `PUT may have timed out — verify playlist "${created.name}" in ProPresenter (${created.id}).`,
    );
    if (e instanceof Error && !/timeout/i.test(e.message)) throw e;
  }

  const written = await getPlaylistItems(created.id);

  return {
    ok: true,
    playlistId: created.id,
    playlistName: created.name,
    itemCount: written.length,
    items: written.map((item, index) => ({
      position: index + 1,
      name: item.name,
      kind: item.name.match(/\(EN\)/) ? "song_add" : "template_inherit",
    })),
    warnings,
  };
}
