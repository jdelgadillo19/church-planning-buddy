import { buildPlaylistNameFromPlanDate } from "./playlist-name";
import type { MockCommitPlan } from "./mock-commit";

/** Minimal commit plan for bring-your-own uploads (no prior Create Presentation). */
export function buildByoCommitPlan(input: {
  planId: string;
  serviceDateRaw?: string | null;
  playlistName?: string;
  items: Array<{ position: number; name: string }>;
}): MockCommitPlan {
  const playlistName =
    input.playlistName?.trim() ||
    buildPlaylistNameFromPlanDate(input.serviceDateRaw ?? null);

  return {
    dryRun: true,
    writesBlocked: true,
    planId: Number(input.planId) || 0,
    playlistName,
    serviceDate: input.serviceDateRaw ?? undefined,
    templateSource: "BYO upload",
    templateItemCount: 0,
    operations: [],
    playlistPreview: input.items.map((it, idx) => ({
      position: it.position > 0 ? it.position : idx + 1,
      kind: "song_add",
      name: it.name,
      source: "BYO upload",
    })),
    correspondences: [],
    warnings: ["Uploaded without Grapevine Create Presentation."],
    propresenterConnected: true,
  };
}
