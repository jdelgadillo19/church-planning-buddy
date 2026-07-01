import type { TemplateCorrespondence } from "./pco-pp-correspondence";

/** Dry-run status before library matching exists. */
export type ManifestMatchStatus =
  | "would_include"
  | "would_skip"
  | "pending_match"
  | "needs_disambiguation";

export type ManifestPlaylistIntent = "include" | "skip";

/** Role in the slide-deck manifest (PCO-only Phase 1). */
export type ManifestElementRole = "song" | "pco_skip";

export type ManifestSkipReason =
  | "section_header"
  | "template_covered"
  | "ops_meta"
  | "non_worship_song"
  | "media_not_in_deck";

export type ServiceOrderSong = {
  itemId: string;
  title: string;
  key: string;
  artist: string;
  sequence: number;
  songId?: string;
  arrangementId?: string;
};

/** PCO plan item timing — pre-service, during service, or post-service. */
export type PcoItemTime = "pre" | "during" | "post";

export type ServiceOrderItem = {
  itemId: string;
  itemType: string;
  title: string;
  sequence: number;
  /** When the item runs relative to the service (from PCO). */
  time?: PcoItemTime;
  description?: string;
  song?: ServiceOrderSong;
};

export type ServiceOrderPlan = {
  planId: number;
  serviceTypeId: number;
  dateRaw: string;
  dateFormatted: string;
  items: ServiceOrderItem[];
};

export type ManifestElement = {
  order: number;
  pcoItemId: string;
  pcoItemType: string;
  pcoTitle: string;
  role: ManifestElementRole;
  playlistIntent: ManifestPlaylistIntent;
  matchStatus: ManifestMatchStatus;
  propresenterSearchHint?: string;
  key?: string;
  artist?: string;
  skipReason?: ManifestSkipReason;
  /** When skipReason is template_covered — link to ProPresenter template item. */
  templateCorrespondence?: TemplateCorrespondence;
  notes?: string;
};

export type TemplatePlaylistPlan = {
  sourcePlaylistName: string;
  targetPlaylistName: string;
  plannedAction: "duplicate_and_rename" | "create_from_plan";
  /** Read-only check when ProPresenter is connected. */
  sourceFound: boolean | null;
  sourcePlaylistId?: string;
  sourcePlaylistPath?: string;
};

export type SlideDeckManifest = {
  dryRun: true;
  planId: number;
  serviceTypeId: number;
  serviceDate: string;
  serviceDateFormatted: string;
  playlistName: string;
  template: TemplatePlaylistPlan;
  elements: ManifestElement[];
  summary: {
    totalPcoItems: number;
    playlistSongCount: number;
    skippedCount: number;
  };
  propresenterConnected?: boolean;
};
