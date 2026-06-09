import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  loadProPresenterExportStagingDir,
  resolveExportAppleScriptPath,
} from "./rig-export-paths";

const rigEnv = { RIG_ID: "rig-test", HOME: os.tmpdir() } as NodeJS.ProcessEnv;

const staging = loadProPresenterExportStagingDir(rigEnv);
assert.ok(!staging.includes("/.data"), `rig staging must not use /.data: ${staging}`);
assert.ok(
  staging.includes(path.join("grapevine-rig", "pp-exports")),
  `expected tmp grapevine-rig path: ${staging}`,
);

const explicit = loadProPresenterExportStagingDir({
  PP_EXPORT_STAGING_DIR: "/tmp/custom-pp-exports",
} as NodeJS.ProcessEnv);
assert.equal(explicit, "/tmp/custom-pp-exports");

const script = resolveExportAppleScriptPath({
  PP_EXPORT_APPLESCRIPT_PATH: "/Applications/Grapevine Rig.app/Contents/Resources/export-playlist.applescript",
} as NodeJS.ProcessEnv);
assert.ok(script.endsWith("export-playlist.applescript"), script);

console.log("rig-export-paths.test.ts ok");
