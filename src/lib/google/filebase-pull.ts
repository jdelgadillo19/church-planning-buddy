import type { drive_v3 } from "@/lib/google/api-types";
import { resolveLibraryItemForRow } from "@/lib/slide-deck/apply-commit";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";
import type { PpLibraryItemRef } from "@/lib/propresenter/library-read";
import type { PpPlaylistItemRef } from "@/lib/propresenter/playlist-read";
import { buildStoreZip, sha256Hex, type ZipEntry } from "@/lib/zip/buffer-zip";
import { normalizePresentationFonts } from "@/lib/propresenter/pro-font-normalize";
import { driveDownloadFileBytes } from "./drive-download";

export type FilebasePullManifest = {
  planId: string;
  playlistName: string;
  serviceDate: string;
  requestedPaths: string[];
  songPaths: string[];
  templatePaths: string[];
  mediaPaths: string[];
  missingMediaPaths: string[];
  skippedMediaPaths: string[];
  missingPaths: string[];
  fileCount: number;
  snapshotMetaPath?: string;
  fontNormalization?: Array<{
    path: string;
    changed: boolean;
    dominantFont: string | null;
  }>;
};

type SnapshotFileRef = {
  relativePath: string;
  driveFileId?: string;
  sha256?: string;
  size?: number;
};

const MEDIA_EXTENSIONS = [
  "mp4",
  "mov",
  "m4v",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "wav",
  "mp3",
  "aif",
  "aiff",
  "pdf",
] as const;
const MEDIA_EXT_RE = new RegExp(`\\.(${MEDIA_EXTENSIONS.join("|")})$`, "i");
const MEDIA_REF_RE = new RegExp(
  `(?:Media/[A-Za-z0-9 _().,+'&!@#\\-\\[\\]/]+|[A-Za-z0-9][A-Za-z0-9 _().,+'&!@#\\-\\[\\]]{0,220})\\.(${MEDIA_EXTENSIONS.join("|")})`,
  "gi",
);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "heic", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "wmv"]);
// Cloudflare Workers have a ~128 MB memory ceiling and we build the whole zip
// in memory, so media caps must stay well under that. Images sail through;
// large background videos are skipped (and reported in skippedMediaPaths).
const DEFAULT_MEDIA_MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MEDIA_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function envBytes(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function fileNameOf(path: string): string {
  return normalizeRelPath(path).split("/").pop() ?? path;
}

function extOf(path: string): string {
  const match = fileNameOf(path).match(/\.([^.]+)$/);
  return match?.[1]?.toLowerCase() ?? "";
}

function isMediaPath(path: string): boolean {
  const rel = normalizeRelPath(path);
  return rel.startsWith("Media/") && MEDIA_EXT_RE.test(rel);
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeMediaRef(ref: string): string {
  return normalizeRelPath(decodeUriComponentSafe(ref))
    .replace(/^file:\/+/, "")
    .replace(/^.*\/(Media\/)/i, "Media/")
    .trim();
}

function printableStrings(buf: Buffer): string[] {
  const out: string[] = [];
  let start = -1;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    const printable = b >= 32 && b <= 126;
    if (printable) {
      if (start === -1) start = i;
      continue;
    }
    if (start !== -1 && i - start >= 4) {
      out.push(buf.subarray(start, i).toString("utf8"));
    }
    start = -1;
  }
  if (start !== -1 && buf.length - start >= 4) {
    out.push(buf.subarray(start).toString("utf8"));
  }
  return out;
}

export function extractMediaReferencesFromPresentation(bytes: Buffer): string[] {
  const refs = new Set<string>();
  for (const chunk of printableStrings(bytes)) {
    for (const source of [chunk, decodeUriComponentSafe(chunk)]) {
      for (const match of source.matchAll(MEDIA_REF_RE)) {
        // Avoid treating the suffix of URL-encoded filenames (`%20Slide.png`) as
        // standalone media names (`20Slide.png`).
        if (match.index && source[match.index - 1] === "%") continue;
        const ref = normalizeMediaRef(match[0] ?? "");
        if (!ref || ref.includes("{") || ref.includes("}")) continue;
        refs.add(ref);
      }
    }
  }
  return [...refs];
}

function scoreMediaPath(path: string): number {
  const rel = normalizeRelPath(path);
  let score = 0;
  if (rel.startsWith("Media/Assets/Backgrounds/")) score += 8;
  if (rel.startsWith("Media/Assets/Permanent Files/")) score += 6;
  if (rel.startsWith("Media/Assets/")) score += 4;
  if (rel.startsWith("Media/ProContent/")) score += 2;
  if (rel.startsWith("Media/Assets/Current Files/")) score -= 2;
  score -= Math.min(rel.length / 1000, 1);
  return score;
}

function pickBestMediaPath(paths: string[]): string {
  return paths.toSorted((a, b) => {
    const scoreDiff = scoreMediaPath(b) - scoreMediaPath(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.length - b.length || a.localeCompare(b);
  })[0]!;
}

function mediaPullPriority(path: string): number {
  const ext = extOf(path);
  if (IMAGE_EXTENSIONS.has(ext)) return 0;
  if (ext === "pdf") return 1;
  if (VIDEO_EXTENSIONS.has(ext)) return 2;
  return 3;
}

function sortMediaForPull(paths: string[], byPath: Map<string, SnapshotFileRef>): string[] {
  return paths.toSorted((a, b) => {
    const priorityDiff = mediaPullPriority(a) - mediaPullPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    const sizeDiff = (byPath.get(a)?.size ?? 0) - (byPath.get(b)?.size ?? 0);
    if (sizeDiff !== 0) return sizeDiff;
    return a.localeCompare(b);
  });
}

export function resolveMediaPathsForReferences(
  references: string[],
  snapshotFiles: SnapshotFileRef[],
): { mediaPaths: string[]; missingMediaPaths: string[] } {
  const byPath = new Map<string, string>();
  const byBase = new Map<string, string[]>();
  for (const f of snapshotFiles) {
    const rel = normalizeRelPath(f.relativePath);
    if (!isMediaPath(rel)) continue;
    byPath.set(rel.toLowerCase(), rel);
    const baseKey = fileNameOf(rel).toLowerCase();
    const bucket = byBase.get(baseKey) ?? [];
    bucket.push(rel);
    byBase.set(baseKey, bucket);
  }

  const mediaPaths = new Set<string>();
  const missingMediaPaths = new Set<string>();
  for (const rawRef of references) {
    const ref = normalizeMediaRef(rawRef);
    if (!ref) continue;
    const exact = ref.toLowerCase().startsWith("media/") ? byPath.get(ref.toLowerCase()) : null;
    if (exact) {
      mediaPaths.add(exact);
      continue;
    }
    const candidates = byBase.get(fileNameOf(ref).toLowerCase()) ?? [];
    if (candidates.length > 0) {
      mediaPaths.add(pickBestMediaPath(candidates));
      continue;
    }
    missingMediaPaths.add(ref);
  }

  return { mediaPaths: [...mediaPaths], missingMediaPaths: [...missingMediaPaths] };
}

function bundleFolderName(segment: string): string | null {
  if (!segment.toLowerCase().endsWith(".probundle")) return null;
  return segment.replace(/\.probundle$/i, "");
}

function isLibrariesPath(rel: string): boolean {
  return rel.startsWith("Libraries/") || rel.startsWith("Libraries ");
}

function assetRootForPath(rel: string): string | null {
  const bundleMatch = rel.match(/^(.*\.proBundle)\//i);
  if (bundleMatch) return bundleMatch[1]!;
  if (rel.toLowerCase().endsWith(".pro")) return rel;
  return null;
}

function scoreAssetRoot(root: string, libraryName?: string): number {
  let score = 0;
  if (root.toLowerCase().includes(".probundle")) score += 2;
  if (libraryName) {
    const libSeg = `Libraries/${libraryName}/`;
    if (root.includes(libSeg)) score += 10;
  }
  if (root.includes("Libraries/Songs/")) score += 3;
  if (root.includes("Libraries/Service Order/")) score += 3;
  if (root.includes("Libraries/Import/")) score -= 5;
  return score;
}

function pickBestAssetRoots(
  paths: string[],
  libraryName?: string,
): Set<string> {
  const byRoot = new Map<string, string[]>();
  for (const rel of paths) {
    const root = assetRootForPath(rel);
    if (!root) continue;
    const bucket = byRoot.get(root) ?? [];
    bucket.push(rel);
    byRoot.set(root, bucket);
  }
  if (byRoot.size === 0) return new Set();

  let bestScore = Number.NEGATIVE_INFINITY;
  for (const root of byRoot.keys()) {
    bestScore = Math.max(bestScore, scoreAssetRoot(root, libraryName));
  }

  const winners = new Set<string>();
  for (const [root, files] of byRoot) {
    if (scoreAssetRoot(root, libraryName) === bestScore) {
      for (const f of files) winners.add(f);
    }
  }
  return winners;
}

/**
 * Collect snapshot paths for a library item name — whole `.proBundle/` trees and legacy `.pro` files.
 * When the same title exists under Songs and Import, prefer the rig library folder (e.g. Songs).
 */
export function findSnapshotPathsForSong(
  songName: string,
  snapshotFiles: Array<{ relativePath: string }>,
  options?: { libraryName?: string },
): string[] {
  const needle = normName(songName);
  const hits = new Set<string>();

  for (const f of snapshotFiles) {
    const rel = f.relativePath.replace(/\\/g, "/");
    if (!isLibrariesPath(rel)) continue;

    const parts = rel.split("/");
    for (let i = 0; i < parts.length; i++) {
      const bundleName = bundleFolderName(parts[i] ?? "");
      if (bundleName && normName(bundleName) === needle) {
        hits.add(rel);
        break;
      }
    }

    const base = parts[parts.length - 1] ?? "";
    if (base.toLowerCase().endsWith(".pro")) {
      const stem = base.replace(/\.pro$/i, "");
      if (normName(stem) === needle) hits.add(rel);
    }
  }

  return [...pickBestAssetRoots([...hits], options?.libraryName)];
}

function findSnapshotPathsForTemplatePlaylist(
  templatePath: string,
  snapshotFiles: Array<{ relativePath: string }>,
): string[] {
  const normalized = templatePath.replace(/\\/g, "/");
  const hits = new Set<string>();
  const fileName = normalized.split("/").pop() ?? normalized;
  const stem = fileName.replace(/\.proplaylist$/i, "");

  for (const f of snapshotFiles) {
    const rel = f.relativePath.replace(/\\/g, "/");
    const base = rel.split("/").pop() ?? rel;
    const baseStem = base.replace(/\.proplaylist$/i, "").replace(/\.pro6plx$/i, "");
    if (
      rel === normalized ||
      rel.endsWith(`/${normalized}`) ||
      rel.endsWith(`/${fileName}`) ||
      (rel.startsWith("Playlists/") && baseStem.toLowerCase() === stem.toLowerCase())
    ) {
      hits.add(rel);
    }
  }

  return [...hits];
}

/** Presentation names from the Sundays Template playlist → `.pro` / `.proBundle` on Drive. */
export function resolveTemplatePresentationPaths(
  templateItems: PpPlaylistItemRef[],
  snapshotFiles: Array<{ relativePath: string }>,
  options?: { libraryName?: string },
): string[] {
  const paths = new Set<string>();
  const libraryName = options?.libraryName ?? "Service Order";

  for (const item of templateItems) {
    const name = item.name.trim();
    if (!name) continue;
    for (const p of findSnapshotPathsForSong(name, snapshotFiles, { libraryName })) {
      paths.add(p);
    }
  }

  return [...paths];
}

/**
 * Resolve library-relative paths needed for a commit plan against a filebase snapshot index.
 */
export function resolveFilebasePathsForPlan(
  commitPlan: MockCommitPlan,
  manifest: SlideDeckManifest | null,
  cloudLibraryIndex: PpLibraryItemRef[],
  snapshotFiles: Array<{ relativePath: string; driveFileId?: string }>,
  librarySelections: Record<string, string> = {},
  templateItems: PpPlaylistItemRef[] = [],
): { songPaths: string[]; templatePaths: string[]; requestedPaths: string[] } {
  const songPaths = new Set<string>();
  const templatePaths = new Set<string>();

  for (const row of commitPlan.playlistPreview) {
    if (row.kind !== "song_add") continue;
    const cloudItem = resolveLibraryItemForRow(row, cloudLibraryIndex, librarySelections);
    if (!cloudItem) continue;

    for (const p of findSnapshotPathsForSong(cloudItem.name, snapshotFiles, {
      libraryName: cloudItem.libraryName,
    })) {
      songPaths.add(p);
    }
  }

  if (templateItems.length > 0) {
    for (const p of resolveTemplatePresentationPaths(templateItems, snapshotFiles)) {
      templatePaths.add(p);
    }
  } else {
    for (const row of commitPlan.playlistPreview) {
      if (row.kind !== "template_inherit") continue;
      for (const p of findSnapshotPathsForSong(row.name, snapshotFiles, {
        libraryName: "Service Order",
      })) {
        templatePaths.add(p);
      }
    }
  }

  if (manifest?.template.sourcePlaylistPath) {
    for (const p of findSnapshotPathsForTemplatePlaylist(
      manifest.template.sourcePlaylistPath,
      snapshotFiles,
    )) {
      templatePaths.add(p);
    }
  }

  const requestedPaths = [...songPaths, ...templatePaths];
  return {
    songPaths: [...songPaths],
    templatePaths: [...templatePaths],
    requestedPaths,
  };
}

export async function buildFilebasePullZip(input: {
  drive: drive_v3.Drive;
  commitPlan: MockCommitPlan;
  manifest: SlideDeckManifest | null;
  cloudLibraryIndex: PpLibraryItemRef[];
  templateItems?: PpPlaylistItemRef[];
  snapshotFiles: Array<{ relativePath: string; driveFileId: string; sha256?: string; size?: number }>;
  librarySelections?: Record<string, string>;
  mediaMaxFileBytes?: number;
  mediaMaxTotalBytes?: number;
}): Promise<{ zip: Buffer; manifest: FilebasePullManifest }> {
  const resolved = resolveFilebasePathsForPlan(
    input.commitPlan,
    input.manifest,
    input.cloudLibraryIndex,
    input.snapshotFiles,
    input.librarySelections ?? {},
    input.templateItems ?? [],
  );
  const requested = resolved.requestedPaths;

  const byPath = new Map(
    input.snapshotFiles.map((f) => [normalizeRelPath(f.relativePath), f]),
  );

  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  const mediaReferences = new Set<string>();
  const fontNormalization: NonNullable<FilebasePullManifest["fontNormalization"]> = [];

  for (const rel of requested) {
    const meta = byPath.get(rel);
    if (!meta?.driveFileId) {
      missing.push(rel);
      continue;
    }
    let bytes = await driveDownloadFileBytes(input.drive, meta.driveFileId);
    if (meta.sha256 && sha256Hex(bytes) !== meta.sha256) {
      missing.push(`${rel} (sha256 mismatch)`);
      continue;
    }
    if (rel.toLowerCase().endsWith(".pro")) {
      const normalized = normalizePresentationFonts(bytes);
      if (normalized.changed) {
        fontNormalization.push({
          path: rel,
          changed: true,
          dominantFont: normalized.report.dominantFont,
        });
        bytes = normalized.bytes;
      }
      for (const mediaRef of extractMediaReferencesFromPresentation(bytes)) {
        mediaReferences.add(mediaRef);
      }
    }
    entries.push({ path: rel, data: bytes });
  }

  const resolvedMedia = resolveMediaPathsForReferences([...mediaReferences], input.snapshotFiles);
  const mediaMaxFileBytes =
    input.mediaMaxFileBytes ??
    envBytes("PP_FILEBASE_PULL_MEDIA_MAX_FILE_BYTES", DEFAULT_MEDIA_MAX_FILE_BYTES);
  const mediaMaxTotalBytes =
    input.mediaMaxTotalBytes ??
    envBytes("PP_FILEBASE_PULL_MEDIA_MAX_TOTAL_BYTES", DEFAULT_MEDIA_MAX_TOTAL_BYTES);
  const mediaPaths: string[] = [];
  const missingMediaPaths = [...resolvedMedia.missingMediaPaths];
  const skippedMediaPaths: string[] = [];
  const alreadyIncluded = new Set(entries.map((e) => normalizeRelPath(e.path)));
  let mediaTotalBytes = 0;

  for (const rel of sortMediaForPull(resolvedMedia.mediaPaths, byPath)) {
    if (alreadyIncluded.has(rel)) continue;
    const meta = byPath.get(rel);
    if (!meta?.driveFileId) {
      missingMediaPaths.push(rel);
      continue;
    }
    const indexedSize = meta.size ?? 0;
    if (indexedSize > mediaMaxFileBytes) {
      skippedMediaPaths.push(`${rel} (${indexedSize} bytes > ${mediaMaxFileBytes} max)`);
      continue;
    }
    if (indexedSize > 0 && mediaTotalBytes + indexedSize > mediaMaxTotalBytes) {
      skippedMediaPaths.push(`${rel} (media budget exceeded)`);
      continue;
    }

    const bytes = await driveDownloadFileBytes(input.drive, meta.driveFileId);
    if (bytes.length > mediaMaxFileBytes || mediaTotalBytes + bytes.length > mediaMaxTotalBytes) {
      skippedMediaPaths.push(`${rel} (media budget exceeded after download)`);
      continue;
    }
    if (meta.sha256 && sha256Hex(bytes) !== meta.sha256) {
      missingMediaPaths.push(`${rel} (sha256 mismatch)`);
      continue;
    }
    entries.push({ path: rel, data: bytes });
    mediaPaths.push(rel);
    mediaTotalBytes += bytes.length;
  }

  const zip = buildStoreZip(entries);
  const requestedWithMedia = [...requested, ...mediaPaths];
  return {
    zip,
    manifest: {
      planId: String(input.commitPlan.planId),
      playlistName: input.commitPlan.playlistName,
      serviceDate: input.commitPlan.serviceDate ?? "",
      requestedPaths: requestedWithMedia,
      songPaths: resolved.songPaths,
      templatePaths: resolved.templatePaths,
      mediaPaths,
      missingMediaPaths,
      skippedMediaPaths,
      missingPaths: missing,
      fileCount: entries.length,
      ...(fontNormalization.length > 0 ? { fontNormalization } : {}),
    },
  };
}
