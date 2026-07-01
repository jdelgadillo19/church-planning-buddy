import { classifyPcoForPlaylist } from "./pco-exclusions";
import { useTemplatePlaylistAssembly } from "@/lib/config/slide-deck";
import type {
  ManifestElement,
  ManifestElementRole,
  ManifestMatchStatus,
  ManifestPlaylistIntent,
  ServiceOrderItem,
} from "./types";
import type { TemplateCorrespondence } from "./pco-pp-correspondence";

function roleForInclude(include: boolean): ManifestElementRole {
  return include ? "song" : "pco_skip";
}

function intentForInclude(include: boolean): ManifestPlaylistIntent {
  return include ? "include" : "skip";
}

function matchStatusForInclude(include: boolean): ManifestMatchStatus {
  return include ? "would_include" : "would_skip";
}

export function classifyServiceOrderItem(
  item: ServiceOrderItem,
  order: number,
  templateCorrespondence?: TemplateCorrespondence,
  opts?: { useTemplateAssembly?: boolean },
): ManifestElement {
  const useTemplate = opts?.useTemplateAssembly ?? useTemplatePlaylistAssembly();
  const decision = classifyPcoForPlaylist(item, { useTemplateAssembly: useTemplate });

  const element: ManifestElement = {
    order,
    pcoItemId: item.itemId,
    pcoItemType: item.itemType,
    pcoTitle: item.title,
    role: roleForInclude(decision.include),
    playlistIntent: intentForInclude(decision.include),
    matchStatus: matchStatusForInclude(decision.include),
    skipReason: decision.include ? undefined : decision.reason,
    notes: decision.include ? undefined : decision.detail,
    templateCorrespondence:
      useTemplate && !decision.include && decision.reason === "template_covered"
        ? templateCorrespondence
        : undefined,
  };

  if (decision.include) {
    element.propresenterSearchHint = item.title;
    if (item.song) {
      element.key = item.song.key || undefined;
      element.artist = item.song.artist || undefined;
    }
  }

  if (
    useTemplate &&
    !decision.include &&
    decision.reason === "template_covered" &&
    templateCorrespondence?.status === "matched" &&
    templateCorrespondence.ppItemName
  ) {
    element.notes = `Maps to template item "${templateCorrespondence.ppItemName}".`;
  }

  return element;
}
