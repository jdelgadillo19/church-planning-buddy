import { ppRequest } from "./client";
import { loadProPresenterConfig } from "./config";
import type { PpJson } from "./types";

export type PpLibraryRef = {
  id: string;
  name: string;
};

export type PpLibraryItemRef = {
  id: string;
  name: string;
  libraryId: string;
  libraryName: string;
};

function libraryItemsArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as PpJson;
    if (Array.isArray(o.items)) return o.items as unknown[];
  }
  return [];
}

function itemName(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const o = row as PpJson;
  if (o.id && typeof o.id === "object" && !Array.isArray(o.id)) {
    const nested = o.id as PpJson;
    if (typeof nested.name === "string") return nested.name.trim();
  }
  if (typeof o.name === "string") return o.name.trim();
  return "";
}

function itemId(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const o = row as PpJson;
  if (o.id && typeof o.id === "object" && !Array.isArray(o.id)) {
    const nested = o.id as PpJson;
    if (typeof nested.uuid === "string") return nested.uuid;
  }
  if (typeof o.uuid === "string") return o.uuid;
  return undefined;
}

export async function listLibraries(): Promise<PpLibraryRef[]> {
  const config = loadProPresenterConfig();
  const { data } = await ppRequest("v1/libraries", { config });
  const rows = Array.isArray(data) ? data : [];
  const out: PpLibraryRef[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as PpJson;
    const id = typeof o.uuid === "string" ? o.uuid : undefined;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (id && name) out.push({ id, name });
  }
  return out;
}

export async function listLibraryItems(libraryId: string, libraryName: string): Promise<PpLibraryItemRef[]> {
  const config = loadProPresenterConfig();
  const { data } = await ppRequest(`v1/library/${libraryId}`, { config });
  const rows = libraryItemsArray(data);
  const out: PpLibraryItemRef[] = [];
  for (const row of rows) {
    const id = itemId(row);
    const name = itemName(row);
    if (!id || !name) continue;
    out.push({ id, name, libraryId, libraryName });
  }
  return out;
}

/** Load items from configured song libraries (Default + Songs by default). */
export async function loadSongLibraryIndex(
  libraryNames = ["Default", "Songs", "Service Order"],
): Promise<PpLibraryItemRef[]> {
  const libraries = await listLibraries();
  const targets = new Set(libraryNames.map((n) => n.trim().toLowerCase()));
  const out: PpLibraryItemRef[] = [];
  for (const lib of libraries) {
    if (!targets.has(lib.name.toLowerCase())) continue;
    const items = await listLibraryItems(lib.id, lib.name);
    out.push(...items);
  }
  return out;
}

export type LibraryMatchResult = {
  status: "found" | "not_found" | "unchecked" | "ambiguous";
  searchTerm: string;
  item?: PpLibraryItemRef;
  candidates?: PpLibraryItemRef[];
  note?: string;
};

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Case-insensitive title match against song libraries (exact, then contains). */
export function matchLibraryItem(
  searchTerm: string,
  index: PpLibraryItemRef[],
): LibraryMatchResult {
  const needle = normalizeSearch(searchTerm);
  if (!needle) {
    return { status: "not_found", searchTerm, note: "Empty search term." };
  }

  const exact = index.find((item) => normalizeSearch(item.name) === needle);
  if (exact) return { status: "found", searchTerm, item: exact };

  const contains = index.filter((item) => {
    const hay = normalizeSearch(item.name);
    return hay.includes(needle) || needle.includes(hay);
  });

  if (contains.length === 1) {
    return { status: "found", searchTerm, item: contains[0] };
  }

  if (contains.length > 1) {
    const candidates = [...contains].sort((a, b) => a.name.localeCompare(b.name));
    return {
      status: "ambiguous",
      searchTerm,
      candidates,
      note: `${contains.length} library matches — select a variant.`,
    };
  }

  return { status: "not_found", searchTerm, note: "No library item matched." };
}
