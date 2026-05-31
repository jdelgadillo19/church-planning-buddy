import { resolveTemplatePlaylistName } from "@/lib/config/slide-deck";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import type { ServiceOrderPlan } from "./types";
import { classifyServiceOrderItem } from "./classify-element";
import { buildPlaylistNameFromPlanDate } from "./playlist-name";
import { resolveTemplateCorrespondence } from "./pco-pp-correspondence";
import { classifyPcoForPlaylist } from "./pco-exclusions";
import type { SlideDeckManifest, TemplatePlaylistPlan } from "./types";

export type BuildManifestInput = {
  plan: ServiceOrderPlan;
  templatePlaylistName?: string;
  templateSourceFound?: boolean | null;
  templateSourcePlaylistId?: string;
  templateSourcePlaylistPath?: string;
  propresenterConnected?: boolean;
  /** When available, PCO template-covered items get PP correspondence metadata. */
  templateItems?: PpPlaylistItemRef[];
};

export function buildSlideDeckManifest(input: BuildManifestInput): SlideDeckManifest {
  const sourcePlaylistName = resolveTemplatePlaylistName(input.templatePlaylistName);
  const targetPlaylistName = buildPlaylistNameFromPlanDate(input.plan.dateRaw);

  const template: TemplatePlaylistPlan = {
    sourcePlaylistName,
    targetPlaylistName,
    plannedAction: "duplicate_and_rename",
    sourceFound: input.templateSourceFound ?? null,
    sourcePlaylistId: input.templateSourcePlaylistId,
    sourcePlaylistPath: input.templateSourcePlaylistPath,
  };

  const templateItems = input.templateItems ?? [];

  const elements = input.plan.items.map((item, index) => {
    const decision = classifyPcoForPlaylist(item);
    const correspondence =
      !decision.include &&
      decision.reason === "template_covered" &&
      templateItems.length > 0
        ? resolveTemplateCorrespondence(item.title, templateItems)
        : undefined;

    return classifyServiceOrderItem(item, index + 1, correspondence);
  });

  const songCount = elements.filter((e) => e.playlistIntent === "include").length;
  const skippedCount = elements.filter((e) => e.playlistIntent === "skip").length;

  return {
    dryRun: true,
    planId: input.plan.planId,
    serviceTypeId: input.plan.serviceTypeId,
    serviceDate: input.plan.dateRaw,
    serviceDateFormatted: input.plan.dateFormatted,
    playlistName: targetPlaylistName,
    template,
    elements,
    summary: {
      totalPcoItems: elements.length,
      playlistSongCount: songCount,
      skippedCount,
    },
    propresenterConnected: input.propresenterConnected,
  };
}
