import {
  buildWriteItemsFromPreview,
  remapLibrarySelectionsToLive,
} from "@/lib/slide-deck/apply-commit";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import { resolveApplyContextFromCloudSnapshot } from "@/lib/slide-deck/resolve-apply-context";
import { isProPresenterApiError, ppRequest } from "@/lib/propresenter/client";
import type { ProPresenterConfig } from "@/lib/propresenter/config";
import { loadFullLibraryIndex, matchLibraryItem } from "@/lib/propresenter/library-read";
import type { PpWritePlaylistItem } from "@/lib/propresenter/playlist-write";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPresentationMissingError(e: unknown): boolean {
  if (!isProPresenterApiError(e)) return false;
  if (e.status === 404) return true;
  return /404|not found/i.test(e.message);
}

export async function presentationExists(
  presentationUuid: string,
  config: ProPresenterConfig,
): Promise<boolean> {
  try {
    await ppRequest(`v1/presentation/${presentationUuid}`, { config });
    return true;
  } catch (e) {
    if (isPresentationMissingError(e)) return false;
    throw e;
  }
}

export async function findMissingPresentationUuids(
  items: PpWritePlaylistItem[],
  config: ProPresenterConfig,
): Promise<string[]> {
  const missing: string[] = [];
  for (const item of items) {
    const uuid = item.target_uuid;
    if (!(await presentationExists(uuid, config))) {
      missing.push(item.id.name);
    }
  }
  return missing;
}

export type LiveLibraryReadyResult = {
  commitPlan: MockCommitPlan;
  templateItems: ReturnType<typeof resolveApplyContextFromCloudSnapshot>["templateItems"];
  libraryIndex: ReturnType<typeof resolveApplyContextFromCloudSnapshot>["libraryIndex"];
  librarySelections: Record<string, string>;
  writePreview: ReturnType<typeof buildWriteItemsFromPreview>;
};

/** After filebase extract, poll until live PP library resolves writable presentation UUIDs. */
export async function waitForLiveLibraryReady(input: {
  commitPlan: MockCommitPlan;
  librarySelections: Record<string, string>;
  config: ProPresenterConfig;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<LiveLibraryReadyResult> {
  const deadline = Date.now() + (input.timeoutMs ?? 180_000);
  const interval = input.pollIntervalMs ?? 3_000;
  let lastMissing: string[] = [];
  let lastWriteCount = 0;
  let lastIndexCount = 0;
  const expectedResolvable = input.commitPlan.playlistPreview.filter(
    (row) => row.libraryMatch?.status !== "not_found",
  ).length;

  while (Date.now() < deadline) {
    const liveLibraryIndex = await loadFullLibraryIndex();
    const librarySelections = remapLibrarySelectionsToLive(
      input.librarySelections,
      input.commitPlan,
      liveLibraryIndex,
    );
    const { commitPlan, templateItems, libraryIndex } = resolveApplyContextFromCloudSnapshot(
      input.commitPlan,
      liveLibraryIndex,
    );
    const writePreview = buildWriteItemsFromPreview({
      commitPlan,
      templateItems,
      libraryIndex,
      librarySelections,
    });

    lastWriteCount = writePreview.items.length;
    lastIndexCount = liveLibraryIndex.length;
    lastMissing = await findMissingPresentationUuids(writePreview.items, input.config);

    const hasEnoughItems =
      writePreview.items.length > 0 &&
      writePreview.items.length >= Math.min(expectedResolvable, 3);

    if (hasEnoughItems && lastMissing.length === 0) {
      return {
        commitPlan,
        templateItems,
        libraryIndex,
        librarySelections,
        writePreview,
      };
    }

    await sleep(interval);
  }

  throw new Error(
    `ProPresenter library not ready after filebase extract (${lastIndexCount} indexed item(s), ${lastWriteCount} to write, ${expectedResolvable} expected). ` +
      `Missing or stale presentation UUID(s): ${lastMissing.slice(0, 8).join(", ") || "none resolved"}. ` +
      "Quit and reopen ProPresenter, or wait for the library scan to finish, then retry Build in Grapevine Client.",
  );
}

/** Pick the first live library candidate whose presentation UUID resolves in ProPresenter. */
export async function pickVerifiedLibraryMatch(
  searchName: string,
  libraryIndex: Awaited<ReturnType<typeof loadFullLibraryIndex>>,
  config: ProPresenterConfig,
) {
  const match = matchLibraryItem(searchName, libraryIndex);
  if (match.status === "found") {
    if (await presentationExists(match.item.id, config)) return match.item;
    return undefined;
  }
  if (match.status === "ambiguous" && match.candidates) {
    for (const candidate of match.candidates) {
      if (await presentationExists(candidate.id, config)) return candidate;
    }
  }
  return undefined;
}
