import { shouldPreferSharedDriveFilebase } from "./filebase-drive-folders";

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const v = overrides[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
}

withEnv(
  {
    GV_DRIVE_LAYOUT: "legacy",
    PP_COMPUTER_FILEBASE_FOLDER_ID: "legacy-id",
    PP_FILEBASE_FOLDER_ID: undefined,
    PP_FILEBASE_FOLDER_PATH: undefined,
    GV_DRIVE_LAYOUT_ROOT_FOLDER_ID: undefined,
  },
  () => {
    if (shouldPreferSharedDriveFilebase(process.env as Record<string, string>)) {
      throw new Error("legacy layout without filebase env should not prefer shared");
    }
  },
);

withEnv(
  {
    GV_DRIVE_LAYOUT: "dual",
    PP_COMPUTER_FILEBASE_FOLDER_ID: "legacy-id",
  },
  () => {
    if (!shouldPreferSharedDriveFilebase(process.env as Record<string, string>)) {
      throw new Error("dual layout should prefer shared Filebase/");
    }
  },
);

withEnv(
  {
    GV_DRIVE_LAYOUT: "legacy",
    GV_DRIVE_LAYOUT_ROOT_FOLDER_ID: "shared-root",
    PP_COMPUTER_FILEBASE_FOLDER_ID: "legacy-id",
  },
  () => {
    if (!shouldPreferSharedDriveFilebase(process.env as Record<string, string>)) {
      throw new Error("GV_DRIVE_LAYOUT_ROOT_FOLDER_ID should prefer shared Filebase/");
    }
  },
);

console.log("filebase-drive-folders tests ok");
