export const RIG_DOWNLOAD_PATHS = {
  macos: "/downloads/grapevine-rig-macos.dmg",
  windows: "/downloads/grapevine-rig-windows-setup.exe",
} as const;

export const RIG_R2_KEYS = {
  macos: "grapevine-rig-macos.dmg",
  windows: "grapevine-rig-windows-setup.exe",
} as const;

export const RIG_DOWNLOAD_FILENAMES = {
  macos: "grapevine-rig-macos.dmg",
  windows: "grapevine-rig-windows-setup.exe",
} as const;

export const RIG_DOWNLOAD_CONTENT_TYPES = {
  macos: "application/x-apple-diskimage",
  windows: "application/octet-stream",
} as const;

export type RigDownloadPlatform = keyof typeof RIG_R2_KEYS;
