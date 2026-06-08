import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanBundle } from "./scanner";

describe("scanBundle", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cpb-bundle-scan-"));
    await fs.mkdir(path.join(tmpRoot, "Libraries", "Default"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "Playlists"), { recursive: true });
    await fs.writeFile(path.join(tmpRoot, "Libraries", "Default", "Song.pro"), "x");
    await fs.writeFile(path.join(tmpRoot, "Playlists", "Sundays Template.proplaylist"), "y");
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("walks Libraries and Playlists under bundle root", async () => {
    const result = await scanBundle({ bundleRoot: tmpRoot, deviceLabel: "test" });
    expect(result.snapshot.schemaVersion).toBe(1);
    expect(result.snapshot.files.length).toBe(2);
    const paths = result.snapshot.files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(
      ["Libraries/Default/Song.pro", "Playlists/Sundays Template.proplaylist"].sort(),
    );
  });

  it("throws when bundle root missing", async () => {
    await expect(
      scanBundle({ bundleRoot: path.join(tmpRoot, "missing"), deviceLabel: "test" }),
    ).rejects.toThrow(/PP_BUNDLE_ROOT not found/);
  });
});
