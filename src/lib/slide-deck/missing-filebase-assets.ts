import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { MockCommitPlan } from "./mock-commit";
import type { MissingFileRef } from "./handoff";

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function cloudHasItem(cloud: PpLibraryItemRef[], item: PpLibraryItemRef): boolean {
  if (item.id && cloud.some((c) => c.id === item.id)) return true;
  const name = normName(item.name);
  return cloud.some((c) => normName(c.name) === name);
}

/**
 * Songs referenced on the prep device that are absent from the org filebase index.
 */
export function missingFilebaseAssets(
  commitPlan: MockCommitPlan,
  localLibraryIndex: PpLibraryItemRef[],
  cloudLibraryIndex: PpLibraryItemRef[],
): MissingFileRef[] {
  const out: MissingFileRef[] = [];
  const seen = new Set<string>();

  for (const row of commitPlan.playlistPreview) {
    if (row.kind !== "song_add") continue;
    const matchId = row.libraryMatch?.item?.id;
    const matchName = row.libraryMatch?.item?.name ?? row.name;
    const localItem =
      (matchId ? localLibraryIndex.find((i) => i.id === matchId) : undefined) ??
      localLibraryIndex.find((i) => normName(i.name) === normName(matchName));

    if (!localItem) {
      const key = `missing-local:${matchName}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          label: matchName,
          reason: "Song is in the plan but not found in local ProPresenter library.",
        });
      }
      continue;
    }

    if (!cloudHasItem(cloudLibraryIndex, localItem)) {
      const key = `missing-cloud:${localItem.id}:${localItem.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          label: localItem.name,
          libraryItemId: localItem.id,
          libraryName: localItem.libraryName,
          reason: "Present on this device but not in the sanctuary filebase index (rig Scan).",
        });
      }
    }
  }

  return out;
}
