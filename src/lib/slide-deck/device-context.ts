/**
 * Slide-deck device roles — do not equate local ProPresenter reachable with presentation rig.
 * See docs/planning/filebase-architecture.md
 */

export type SlideDeckDeviceMode = "browser" | "local_prep" | "dev_local";

export type PpStatusLabelTone = "cloud" | "prep" | "dev" | "disconnected";

export const PP_HOSTED_MESSAGE =
  "ProPresenter is not available in the browser. Preview and Send to rig work here; apply and Scan now run on the sanctuary presentation rig via Grapevine Rig.";

export const PP_LOCAL_PREP_BUILD_HINT =
  "Download builds the playlist into ProPresenter on this device. For sanctuary Sunday apply, use Send to presentation rig from grapevineprep.com.";

export const PP_LOCAL_PREP_APPLY_MESSAGE =
  "Remote prep workstation — not the presentation rig. Build here for editing; sanctuary apply is separate.";

export const PP_LOCAL_APPLY_WRITES_DISABLED_MESSAGE =
  "Set PP_ALLOW_WRITES=true in .env.local and restart the dev server to build into local ProPresenter.";

/** @deprecated Use PP_LOCAL_APPLY_WRITES_DISABLED_MESSAGE — PP_DEV_APPLY is no longer required for prep. */
export const PP_DEV_APPLY_DISABLED_MESSAGE = PP_LOCAL_APPLY_WRITES_DISABLED_MESSAGE;

export const UPLOAD_COMPLETE_HANDOFF_MESSAGE =
  "Complete upload saved. When Services/ publish is configured, the presentation rig will import the package automatically.";

export function isDevLocalApplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" && env.PP_DEV_APPLY === "true";
}

export function deriveSlideDeckDeviceMode(input: {
  hosted?: boolean;
  localPpConnected?: boolean;
  devApplyEnabled?: boolean;
}): SlideDeckDeviceMode {
  if (input.hosted) return "browser";
  if (input.localPpConnected && input.devApplyEnabled) return "dev_local";
  if (input.localPpConnected) return "local_prep";
  return "browser";
}

export function derivePpStatusLabel(input: {
  hosted?: boolean;
  connected?: boolean;
  devApplyEnabled?: boolean;
}): { label: string; tone: PpStatusLabelTone } {
  if (input.connected) {
    if (input.devApplyEnabled) {
      return { label: "Local ProPresenter (dev)", tone: "dev" };
    }
    return { label: "Local ProPresenter (remote prep)", tone: "prep" };
  }
  if (input.hosted) {
    return { label: "Cloud preview", tone: "cloud" };
  }
  return { label: "Not connected", tone: "disconnected" };
}

export function canWebSlideDeckApply(mode: SlideDeckDeviceMode): boolean {
  return mode === "local_prep" || mode === "dev_local";
}

export function canWebUploadScan(mode: SlideDeckDeviceMode): boolean {
  return mode === "local_prep" || mode === "dev_local";
}

export function canWebUploadQueueBuild(): boolean {
  return false;
}

export type RigKind = "presentation" | "bootstrap";

export function isPresentationRigKind(rigKind: string | null | undefined): boolean {
  return (rigKind ?? "presentation") === "presentation";
}
