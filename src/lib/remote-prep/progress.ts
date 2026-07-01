export type RemotePrepProgressStage =
  | "prepare"
  | "resolve_library"
  | "download"
  | "extract"
  | "open_pp"
  | "index_library"
  | "build_playlist";

export type RemotePrepProgress = {
  stage: RemotePrepProgressStage | string;
  label: string;
  percent: number;
  detail?: string;
  updatedAt: string;
};

export const REMOTE_PREP_STAGE_LABELS: Record<RemotePrepProgressStage, string> = {
  prepare: "Preparing service plan",
  resolve_library: "Matching library items",
  download: "Downloading filebase",
  extract: "Installing library files",
  open_pp: "Opening ProPresenter",
  index_library: "Waiting for library scan",
  build_playlist: "Building playlist",
};

export const REMOTE_PREP_STAGE_PERCENT: Record<RemotePrepProgressStage, number> = {
  prepare: 5,
  resolve_library: 15,
  download: 30,
  extract: 45,
  open_pp: 55,
  index_library: 70,
  build_playlist: 90,
};

export function buildRemotePrepProgress(
  stage: RemotePrepProgressStage,
  detail?: string,
): RemotePrepProgress {
  return {
    stage,
    label: REMOTE_PREP_STAGE_LABELS[stage],
    percent: REMOTE_PREP_STAGE_PERCENT[stage],
    detail,
    updatedAt: new Date().toISOString(),
  };
}

export class RemotePrepCancelledError extends Error {
  constructor() {
    super("Remote prep cancelled.");
    this.name = "RemotePrepCancelledError";
  }
}

/** Stages shown during Create Presentation on the web builder. */
export type CreatePresentationStage = "prepare" | "resolve_library" | "build_playlist";

export const CREATE_PRESENTATION_STAGE_LABELS: Record<CreatePresentationStage, string> = {
  prepare: "Loading service plan from Planning Center",
  resolve_library: "Matching ProPresenter library",
  build_playlist: "Building presentation preview",
};

export const CREATE_PRESENTATION_STAGE_PERCENT: Record<CreatePresentationStage, number> = {
  prepare: 20,
  resolve_library: 55,
  build_playlist: 90,
};
