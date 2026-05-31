import { ppRequest } from "./client";
import { loadProPresenterConfig } from "./config";
import type { PpJson } from "./types";

export type PpPlaylistItemRef = {
  id: string;
  name: string;
  index: number;
  type?: string;
  presentationUuid?: string;
  arrangementName?: string;
};

function playlistItemsArray(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const o = data as PpJson;
  if (Array.isArray(o.items)) return o.items as unknown[];
  return [];
}

function parsePlaylistItem(row: unknown, position: number): PpPlaylistItemRef | null {
  if (!row || typeof row !== "object") return null;
  const o = row as PpJson;
  const idObj = o.id && typeof o.id === "object" && !Array.isArray(o.id) ? (o.id as PpJson) : o;
  const name = typeof idObj.name === "string" ? idObj.name.trim() : "";
  const id =
    typeof idObj.uuid === "string"
      ? idObj.uuid
      : typeof o.uuid === "string"
        ? o.uuid
        : undefined;
  if (!id || !name) return null;

  const presInfo =
    o.presentation_info && typeof o.presentation_info === "object"
      ? (o.presentation_info as PpJson)
      : undefined;

  return {
    id,
    name,
    index: typeof idObj.index === "number" ? idObj.index : position,
    type: typeof o.type === "string" ? o.type : undefined,
    presentationUuid:
      typeof presInfo?.presentation_uuid === "string" ? presInfo.presentation_uuid : undefined,
    arrangementName:
      typeof presInfo?.arrangement_name === "string" ? presInfo.arrangement_name : undefined,
  };
}

/** Read-only playlist contents (GET v1/playlist/{uuid}). */
export async function getPlaylistItems(playlistId: string): Promise<PpPlaylistItemRef[]> {
  const config = loadProPresenterConfig();
  const { data } = await ppRequest(`v1/playlist/${playlistId}`, { config });
  const rows = playlistItemsArray(data);
  const out: PpPlaylistItemRef[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = parsePlaylistItem(rows[i], i);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => a.index - b.index);
}
