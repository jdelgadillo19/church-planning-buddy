export type MvpSongSelection = {
  itemId: string;
  skipped: boolean;
  selectedFileId?: string;
  selectedFileName?: string;
};

export type MvpApplyPayload = {
  planId: string;
  serviceTypeId?: string;
  grgDocTitle: string;
  dateFormatted: string;
  songList: Array<{ title: string; key: string; artist: string }>;
  songs: Array<{
    itemId: string;
    title: string;
    skipped: boolean;
    selectedFileId?: string;
  }>;
  skipIntro?: boolean;
};
