import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "apps/grapevine-rig-worker/dist");

function bundle(entry, outfile) {
  execSync(
    `npx esbuild "${entry}" --bundle --platform=node --target=node20 --format=esm --outfile="${outfile}" --alias:@="${path.join(root, "src")}"`,
    { stdio: "inherit", cwd: root },
  );
}

bundle(
  path.join(root, "apps/grapevine-rig-worker/src/worker.ts"),
  path.join(outDir, "worker.mjs"),
);
bundle(
  path.join(root, "apps/grapevine-rig-worker/src/scan.ts"),
  path.join(outDir, "scan.mjs"),
);

console.log("Built worker.mjs + scan.mjs");
