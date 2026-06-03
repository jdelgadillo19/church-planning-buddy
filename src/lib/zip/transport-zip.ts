import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Build a transport zip using the system zip utility (macOS / Linux). */
export async function buildTransportZip(input: {
  entryName: string;
  fileBytes: Buffer;
}): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "cpb-zip-"));
  const entryPath = path.join(workDir, input.entryName);
  const zipPath = path.join(workDir, "archive.zip");

  try {
    await writeFile(entryPath, input.fileBytes);
    await execFileAsync("/usr/bin/zip", ["-j", zipPath, entryPath], { timeout: 60_000 });
    return await readFile(zipPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
