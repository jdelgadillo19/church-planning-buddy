/**
 * Mock smoke tests for rig publish error messages (no ProPresenter / Drive required).
 * Run: npm run rig:publish-smoke
 */
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAuthedClients } from "../src/lib/google/auth";
import { buildPublishBundleFromCommit } from "../src/lib/slide-deck/load-bundle";
import type { ApplyCommitResult } from "../src/lib/slide-deck/apply-commit";
import type { MockCommitPlan } from "../src/lib/slide-deck/mock-commit";
import {
  loadProPresenterExportStagingDir,
  resolveExportAppleScriptPath,
} from "../src/lib/propresenter/rig-export-paths";
import {
  exportPlaylistNative,
  formatProPresenterExportError,
} from "../src/lib/propresenter/playlist-native-export";

type Case = { name: string; run: () => Promise<string> };

const applyResult: ApplyCommitResult = {
  ok: true,
  playlistId: "playlist-1",
  playlistName: "SUN 2026.06.14",
  itemCount: 3,
  items: [],
  warnings: [],
};

const commitPlan: MockCommitPlan = {
  dryRun: true,
  writesBlocked: true,
  planId: 1,
  playlistName: "SUN 2026.06.14",
  serviceDate: "2026-06-14",
  templateSource: "Sundays Template",
  templateItemCount: 5,
  operations: [],
  playlistPreview: [],
  correspondences: [],
  warnings: [],
};

async function expectError(fn: () => Promise<unknown>, includes: string): Promise<string> {
  try {
    await fn();
    throw new Error(`Expected error containing "${includes}"`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes(includes), `Expected "${includes}" in: ${msg}`);
    return msg;
  }
}

const cases: Case[] = [
  {
    name: "rig staging path avoids /.data when cwd is /",
    run: async () => {
      const staging = loadProPresenterExportStagingDir({
        RIG_ID: "rig-1",
        HOME: os.tmpdir(),
      } as NodeJS.ProcessEnv);
      assert.ok(!staging.startsWith("/.data"), staging);
      await mkdir(staging, { recursive: true });
      await rm(staging, { recursive: true, force: true });
      return `staging ok: ${staging}`;
    },
  },
  {
    name: "missing Google OAuth config on rig",
    run: async () =>
      expectError(
        () =>
          Promise.resolve().then(() => {
            getAuthedClients({ access_token: "x" });
          }),
        "Missing GOOGLE_CLIENT_ID",
      ),
  },
  {
    name: "Google OAuth config provided (no .env.local)",
    run: async () => {
      const { auth } = getAuthedClients(
        { access_token: "test-token" },
        { clientId: "cid", clientSecret: "secret" },
      );
      assert.equal(auth.credentials.access_token, "test-token");
      return "getAuthedClients with inline oauth ok";
    },
  },
  {
    name: "publish bundle without PCO",
    run: async () => {
      const bundle = buildPublishBundleFromCommit(commitPlan, applyResult);
      assert.equal(bundle.manifest.serviceDate, "2026-06-14");
      assert.equal(bundle.applyResult?.playlistName, "SUN 2026.06.14");
      return "buildPublishBundleFromCommit ok";
    },
  },
  {
    name: "missing export applescript",
    run: async () =>
      expectError(
        () =>
          exportPlaylistNative({
            playlistName: "SUN 2026.06.14",
            env: {
              RIG_ID: "rig-1",
              PP_EXPORT_STAGING_DIR: path.join(os.tmpdir(), "grapevine-rig-smoke"),
              PP_EXPORT_APPLESCRIPT_PATH: "/nonexistent/export-playlist.applescript",
            },
          }),
        "export script not found",
      ),
  },
  {
    name: "assistive access error message",
    run: async () => {
      const msg = formatProPresenterExportError(
        "Could not open File → Export → Playlist: osascript is not allowed assistive access. (-2700)",
      );
      assert.ok(msg.includes("Accessibility"));
      return msg;
    },
  },
  {
    name: "resolve bundled applescript path from env",
    run: async () => {
      const p = resolveExportAppleScriptPath({
        PP_EXPORT_APPLESCRIPT_PATH: "/Applications/Grapevine Rig.app/Contents/Resources/export-playlist.applescript",
      } as NodeJS.ProcessEnv);
      return `script path: ${p}`;
    },
  },
];

async function main() {
  console.log("Grapevine Rig publish smoke tests\n");
  let failed = 0;

  for (const testCase of cases) {
    try {
      const result = await testCase.run();
      console.log(`✓ ${testCase.name}`);
      console.log(`  → ${result}\n`);
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${testCase.name}`);
      console.log(`  → ${msg}\n`);
    }
  }

  if (failed > 0) {
    console.error(`${failed} case(s) failed.`);
    process.exit(1);
  }
  console.log(`All ${cases.length} smoke cases passed.`);
}

void main();
