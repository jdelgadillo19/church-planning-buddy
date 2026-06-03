import { ppRequest } from "./client";
import { loadProPresenterConfig, type ProPresenterConfig } from "./config";
import type { PpLibraryItemRef } from "./library-read";
import { getPlaylistItems } from "./playlist-read";
import type { PpPlaylistItemRef } from "./playlist-read";
import { findPlaylistByName } from "./playlists-read";

export type PpWritePlaylistItem = {
  destination: string;
  type: string;
  id: { uuid: string; name: string; index?: number };
  target_uuid: string;
  presentation_info: {
    presentation_uuid: string;
    arrangement_name?: string;
    arrangement_uuid?: string;
  };
  is_hidden: boolean;
  is_pco: boolean;
};

export type CreatePlaylistResult = {
  id: string;
  name: string;
};

function applyConfig(config?: ProPresenterConfig): ProPresenterConfig {
  const base = config ?? loadProPresenterConfig();
  const applyTimeout = Number.parseInt(process.env.PP_APPLY_TIMEOUT_MS ?? "120000", 10);
  return {
    ...base,
    requestTimeoutMs: Number.isFinite(applyTimeout) ? applyTimeout : 120_000,
  };
}

export function templateItemToWritePayload(
  ref: PpPlaylistItemRef,
  playlistIndex: number,
): PpWritePlaylistItem {
  const target = ref.presentationUuid ?? ref.id;
  return {
    destination: "presentation",
    type: "presentation",
    id: { uuid: ref.id, name: ref.name, index: playlistIndex },
    target_uuid: target,
    presentation_info: {
      presentation_uuid: target,
      arrangement_name: ref.arrangementName ?? "",
      arrangement_uuid: "",
    },
    is_hidden: false,
    is_pco: false,
  };
}

export function libraryItemToWritePayload(
  item: PpLibraryItemRef,
  playlistIndex: number,
): PpWritePlaylistItem {
  return {
    destination: "presentation",
    type: "presentation",
    id: { uuid: item.id, name: item.name, index: playlistIndex },
    target_uuid: item.id,
    presentation_info: {
      presentation_uuid: item.id,
      arrangement_name: "",
      arrangement_uuid: "",
    },
    is_hidden: false,
    is_pco: false,
  };
}

/** POST v1/playlists — creates an empty playlist with the given name. */
export async function createPlaylist(
  name: string,
  config?: ProPresenterConfig,
): Promise<CreatePlaylistResult> {
  const cfg = applyConfig(config);
  if (!cfg.allowWrites) {
    throw new Error("ProPresenter writes disabled (set PP_ALLOW_WRITES=true).");
  }

  const { data } = await ppRequest("v1/playlists", {
    method: "POST",
    body: { name },
    config: cfg,
  });

  const row = data as { id?: { uuid?: string; name?: string } };
  const id = row.id?.uuid;
  if (!id) throw new Error("ProPresenter did not return a playlist id after create.");
  return { id, name: row.id?.name ?? name };
}

/** PUT v1/playlist/{id} — replaces playlist contents (array body). */
export async function putPlaylistItems(
  playlistId: string,
  items: PpWritePlaylistItem[],
  config?: ProPresenterConfig,
): Promise<void> {
  const cfg = applyConfig(config);
  if (!cfg.allowWrites) {
    throw new Error("ProPresenter writes disabled (set PP_ALLOW_WRITES=true).");
  }

  await ppRequest(`v1/playlist/${playlistId}`, {
    method: "PUT",
    body: items,
    config: cfg,
  });
}

export type PlaylistResolution = "reuse_empty" | "overwrite";

export type ExistingPlaylistSummary = {
  exists: boolean;
  empty: boolean;
  id?: string;
  name?: string;
  itemCount: number;
  items: PpPlaylistItemRef[];
};

export class PlaylistConflictError extends Error {
  readonly playlistId: string;
  readonly playlistName: string;
  readonly itemCount: number;

  constructor(playlistId: string, playlistName: string, itemCount: number) {
    super(
      `A playlist named "${playlistName}" already exists with ${itemCount} item(s). Choose Overwrite to replace it, View to inspect, or Cancel.`,
    );
    this.name = "PlaylistConflictError";
    this.playlistId = playlistId;
    this.playlistName = playlistName;
    this.itemCount = itemCount;
  }
}

export async function getExistingPlaylistSummary(name: string): Promise<ExistingPlaylistSummary> {
  const existing = await findPlaylistByName(name);
  if (!existing) {
    return { exists: false, empty: true, itemCount: 0, items: [] };
  }
  const items = await getPlaylistItems(existing.id);
  return {
    exists: true,
    empty: items.length === 0,
    id: existing.id,
    name: existing.name,
    itemCount: items.length,
    items,
  };
}

export async function assertPlaylistNameAvailable(name: string): Promise<void> {
  const summary = await getExistingPlaylistSummary(name);
  if (summary.exists && !summary.empty && summary.id && summary.name) {
    throw new PlaylistConflictError(summary.id, summary.name, summary.itemCount);
  }
}

/** Find existing playlist by name (empty reuse or overwrite), or create a new one. */
export async function resolveTargetPlaylist(
  name: string,
  resolution: PlaylistResolution = "reuse_empty",
  config?: ProPresenterConfig,
): Promise<CreatePlaylistResult> {
  const existing = await findPlaylistByName(name);
  if (existing) {
    const items = await getPlaylistItems(existing.id);
    if (items.length === 0) {
      return { id: existing.id, name: existing.name };
    }
    if (resolution === "overwrite") {
      return { id: existing.id, name: existing.name };
    }
    throw new PlaylistConflictError(existing.id, existing.name, items.length);
  }
  return createPlaylist(name, config);
}

/** Find existing empty playlist by name, or create a new one. */
export async function createOrReuseEmptyPlaylist(
  name: string,
  config?: ProPresenterConfig,
): Promise<CreatePlaylistResult> {
  return resolveTargetPlaylist(name, "reuse_empty", config);
}

export function findTemplateItemForName(
  templateItems: PpPlaylistItemRef[],
  name: string,
): PpPlaylistItemRef | undefined {
  const target = name.trim().toLowerCase();
  return templateItems.find((item) => item.name.trim().toLowerCase() === target);
}
