import { ppRequest } from "./client";
import { loadProPresenterConfig } from "./config";
import type { PpJson } from "./types";

export type PpPlaylistRef = {
  id: string;
  name: string;
  path?: string;
};

function asPlaylistArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as PpJson;
    for (const key of ["items", "data", "playlists"]) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}

function nestedId(item: unknown): { uuid?: string; name?: string; index?: number } | undefined {
  if (!item || typeof item !== "object") return undefined;
  const id = (item as PpJson).id;
  if (id && typeof id === "object" && !Array.isArray(id)) {
    return id as { uuid?: string; name?: string; index?: number };
  }
  return undefined;
}

function playlistName(item: unknown): string {
  if (!item || typeof item !== "object") return "";
  const o = item as PpJson;
  const nested = nestedId(item);
  if (nested?.name && typeof nested.name === "string") return nested.name.trim();
  const name = o.name ?? o.title ?? o.playlist_name;
  return typeof name === "string" ? name.trim() : "";
}

function playlistId(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const o = item as PpJson;
  const nested = nestedId(item);
  if (nested?.uuid && typeof nested.uuid === "string") return nested.uuid.trim();
  const id = o.uuid ?? o.id ?? o.playlist_id;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number") return String(id);
  return undefined;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function flattenPlaylists(rows: unknown[], prefix = ""): PpPlaylistRef[] {
  const out: PpPlaylistRef[] = [];
  for (const row of rows) {
    const id = playlistId(row);
    const name = playlistName(row);
    if (id && name) {
      const path = prefix ? `${prefix} / ${name}` : name;
      out.push({ id, name, path });
    }
    if (row && typeof row === "object") {
      const children = (row as PpJson).children;
      if (Array.isArray(children) && children.length > 0) {
        const childPath = prefix ? `${prefix} / ${name}` : name;
        out.push(...flattenPlaylists(children, childPath || prefix));
      }
    }
  }
  return out;
}

/** Read-only: list playlists from ProPresenter Local API (includes nested children). */
export async function listPlaylists(): Promise<PpPlaylistRef[]> {
  const config = loadProPresenterConfig();
  const { data } = await ppRequest("v1/playlists", { config });
  return flattenPlaylists(asPlaylistArray(data));
}

/** Case-insensitive exact match on playlist name. */
export async function findPlaylistByName(name: string): Promise<PpPlaylistRef | null> {
  const target = normalizeName(name);
  if (!target) return null;
  const playlists = await listPlaylists();
  return playlists.find((p) => normalizeName(p.name) === target) ?? null;
}
