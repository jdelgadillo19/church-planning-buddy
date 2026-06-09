import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rigRoot = path.join(root, "apps/grapevine-rig");
const tauriRoot = path.join(rigRoot, "src-tauri");
const dist = path.join(root, "apps/grapevine-rig-worker/dist");
const resources = path.join(tauriRoot, "resources");
const binDir = path.join(tauriRoot, "bin");

execSync("npm run rig:worker:build", { stdio: "inherit", cwd: root });

fs.mkdirSync(resources, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });
for (const file of ["worker.mjs", "scan.mjs"]) {
  fs.copyFileSync(path.join(dist, file), path.join(resources, file));
}

const applescript = path.join(root, "scripts/propresenter/export-playlist.applescript");
fs.copyFileSync(applescript, path.join(resources, "export-playlist.applescript"));

console.log("Prepared Grapevine Rig resources (worker.mjs, scan.mjs, export-playlist.applescript).");
console.log("CI/pkg step should place sidecar binaries in src-tauri/bin/.");
