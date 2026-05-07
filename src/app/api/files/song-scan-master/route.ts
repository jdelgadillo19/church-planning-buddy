import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

type ScanRequest = {
  songs: string[];
};

type ScanResult = {
  song: string;
  found: boolean;
};

const RESOURCE_NAME = "(Resources) Song Scan MASTER";

function normalizeFolderName(name: string) {
  return name.trim().replaceAll("/", "-");
}

async function folderHasResource(folderPath: string) {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries.some((e) => e.isFile() && e.name.startsWith(RESOURCE_NAME));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ScanRequest>;
    const songs = Array.isArray(body.songs) ? body.songs : [];

    if (songs.length === 0) {
      return NextResponse.json({ ok: false, error: "No songs provided." }, { status: 400 });
    }

    const root = process.env.CPB_SONG_FILES_ROOT?.trim();
    if (!root) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing CPB_SONG_FILES_ROOT in .env.local. Set it to the folder that contains your song folders.",
        },
        { status: 500 },
      );
    }

    const results: ScanResult[] = [];
    for (const raw of songs) {
      if (typeof raw !== "string" || raw.trim().length === 0) continue;
      const song = raw.trim();
      const folder = path.join(root, normalizeFolderName(song));
      const found = await folderHasResource(folder);
      results.push({ song, found });
    }

    const lines = results.map((r) => `${r.song} - ${r.found ? "yes" : "no"}`);
    return NextResponse.json({ ok: true, lines, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

