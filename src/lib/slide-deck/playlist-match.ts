import type { MockCommitPlan } from "./mock-commit";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";

/** Normalize playlist item names for comparison (aligned with library-read). */
export function normalizePlaylistItemName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ordered names CPB intends to write from commit preview. */
export function expectedNamesFromCommitPlan(commitPlan: MockCommitPlan): string[] {
  return commitPlan.playlistPreview.map((row) => row.name.trim()).filter(Boolean);
}

/** Ordered presentation names from items about to be PUT (post-skip resolution). */
export function expectedNamesFromWriteItems(
  items: Array<{ id: { name: string } }>,
): string[] {
  return items.map((item) => item.id.name.trim()).filter(Boolean);
}

export function allowPartialApply(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PP_ALLOW_PARTIAL_APPLY?.trim().toLowerCase();
  if (raw === "false") return false;
  return true;
}

export type PlaylistMatchResult = {
  matched: boolean;
  differences: string[];
};

/**
 * Compare live ProPresenter playlist items to expected commit preview order.
 * Same length required; pairwise normalized name equality.
 */
export function comparePlaylistToExpected(
  expected: string[],
  actual: PpPlaylistItemRef[],
): PlaylistMatchResult {
  const differences: string[] = [];
  const actualNames = actual.map((item) => item.name.trim()).filter(Boolean);

  if (expected.length !== actualNames.length) {
    differences.push(
      `Item count: expected ${expected.length}, ProPresenter has ${actualNames.length}.`,
    );
  }

  const limit = Math.min(expected.length, actualNames.length);
  for (let i = 0; i < limit; i++) {
    const exp = normalizePlaylistItemName(expected[i]);
    const act = normalizePlaylistItemName(actualNames[i]);
    if (exp !== act) {
      differences.push(
        `Position ${i + 1}: expected "${expected[i]}", got "${actualNames[i]}".`,
      );
    }
  }

  if (expected.length > actualNames.length) {
    for (let i = actualNames.length; i < expected.length; i++) {
      differences.push(`Position ${i + 1}: missing "${expected[i]}".`);
    }
  } else if (actualNames.length > expected.length) {
    for (let i = expected.length; i < actualNames.length; i++) {
      differences.push(`Position ${i + 1}: extra "${actualNames[i]}".`);
    }
  }

  return { matched: differences.length === 0, differences };
}

export function resolveApplyVerifyTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PP_APPLY_VERIFY_MS ?? "30000";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

export function resolveApplyPollIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PP_APPLY_POLL_MS ?? "500";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
}
