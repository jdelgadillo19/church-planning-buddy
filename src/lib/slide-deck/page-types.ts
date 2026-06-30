import type { SlideDeckSubmissionRow } from "@/lib/pp-platform/types";
import type { HandoffAuthorLabel } from "@/lib/pp-platform/handoff-authors";

export type SlideDeckHandoffSummary = Pick<
  SlideDeckSubmissionRow,
  | "id"
  | "handoff_status"
  | "playlist_name"
  | "created_at"
  | "created_by"
  | "missing_elements"
  | "missing_files"
  | "change_summary"
  | "presentation_instance_id"
  | "commit_plan"
  | "manifest"
  | "library_selections"
  | "version_label"
  | "replace_on_rig"
  | "admin_approved_for_rig"
  | "rig_handoff_status"
  | "playlist_file_mtime"
>;

export type HandoffAuthorsMap = Record<string, HandoffAuthorLabel>;

export type UploadScanPayload = {
  expectedPlaylistName: string;
  expectedByName: {
    playlistId: string;
    playlistName: string;
    itemCount: number;
    items: Array<{ position: number; name: string }>;
  } | null;
  selected: null | {
    playlistId: string;
    playlistName: string;
    itemCount: number;
    items: Array<{ position: number; name: string }>;
  };
  playlists: Array<{ id: string; name: string; path?: string }>;
};

export type MissingFileRef = {
  label: string;
  libraryItemId?: string;
  libraryName?: string;
  reason: string;
};
