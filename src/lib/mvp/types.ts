export type MvpSongSelection = {
  itemId: string;
  skipped: boolean;
  selectedFileId?: string;
  selectedFileName?: string;
};

export type MvpRosterRow = {
  teamMemberId?: string;
  pcoPositionName: string;
  positionName: string;
  displayName: string;
  teamName?: string;
  status: string;
  /** Resolved BAND/CHOIR section; required for Guests before apply */
  grgSection?: "band" | "choir" | "all_team";
};

export type MvpApplyPayload = {
  planId: string;
  serviceTypeId?: string;
  grgDocTitle: string;
  dateFormatted: string;
  songList: Array<{ title: string; key: string; artist: string }>;
  roster?: MvpRosterRow[];
  songs: Array<{
    itemId: string;
    title: string;
    skipped: boolean;
    selectedFileId?: string;
  }>;
  skipIntro?: boolean;
  skipScans?: boolean;
};
