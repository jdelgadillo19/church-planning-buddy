"use client";

import type { UploadScanPayload, MissingFileRef } from "@/lib/slide-deck/page-types";

type Props = {
  playlistName: string;
  uploadBusy: boolean;
  uploadScan: UploadScanPayload | null;
  uploadPlaylistId: string;
  uploadDiffs: string[] | null;
  uploadDiffMatched: boolean;
  missingFiles: MissingFileRef[];
  isByo?: boolean;
  isAdmin?: boolean;
  replaceOnRig: boolean;
  adminApproveForRig: boolean;
  onReplaceOnRigChange: (v: boolean) => void;
  onAdminApproveForRigChange: (v: boolean) => void;
  onScanPlaylist: (playlistId?: string) => void;
  onUploadComplete: () => void;
  onUploadIncomplete: () => void;
  onCancel: () => void;
};

export function SlideDeckUploadTool({
  playlistName,
  uploadBusy,
  uploadScan,
  uploadPlaylistId,
  uploadDiffs,
  uploadDiffMatched,
  missingFiles,
  isByo = false,
  isAdmin = false,
  replaceOnRig,
  adminApproveForRig,
  onReplaceOnRigChange,
  onAdminApproveForRigChange,
  onScanPlaylist,
  onUploadComplete,
  onUploadIncomplete,
  onCancel,
}: Props) {
  const blockComplete = missingFiles.length > 0;
  const canComplete = isByo ? Boolean(uploadScan?.selected) : uploadDiffMatched && !blockComplete;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/30 p-5 dark:border-violet-900 dark:bg-violet-950/20">
      <h2 className="text-lg font-medium">Upload tool</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {isByo
          ? "Upload a playlist you built in ProPresenter (with or without Grapevine Create). All versions are kept on cloud."
          : "After editing in ProPresenter, select the presentation day playlist, compare to the expected build, then tag the upload."}
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Presentation day</span>
        <span className="font-mono text-sm">{playlistName}</span>
      </label>

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white/60 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/40">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={replaceOnRig}
            onChange={(e) => onReplaceOnRigChange(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Replace existing playlist on presentation rig</span>
            <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
              {isAdmin
                ? "When approved, rig import may overwrite the Sunday playlist."
                : "Operator will be notified on rig startup before replacing."}
            </span>
          </span>
        </label>
        {isAdmin ? (
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={adminApproveForRig}
              onChange={(e) => onAdminApproveForRigChange(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Admin sign-off — deliver to presentation rig</span>
              <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
                Without this, complete uploads wait for admin approval before rig auto-import.
              </span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Complete uploads require admin sign-off before the rig auto-imports.
          </p>
        )}
      </div>

      {missingFiles.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Media not in sanctuary filebase</p>
          <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
            {missingFiles.map((f) => (
              <li key={`${f.label}-${f.reason}`}>
                {f.label} — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900/60 dark:bg-sky-950/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">Expected playlist</span>
          <span className="font-mono text-xs text-sky-900 dark:text-sky-100">{playlistName}</span>
        </div>

        {uploadBusy ? (
          <p className="text-xs opacity-80">Scanning ProPresenter…</p>
        ) : uploadScan?.selected ? (
          <p className="text-xs opacity-90">
            Selected: <span className="font-mono">{uploadScan.selected.playlistName}</span> (
            {uploadScan.selected.itemCount} item(s))
          </p>
        ) : (
          <p className="text-xs opacity-90">
            Could not find the expected playlist name on this device. Pick one below.
          </p>
        )}

        {uploadScan && !uploadScan.selected && uploadScan.playlists.length > 0 ? (
          <label className="mt-1 flex flex-col gap-1 text-xs">
            <span>Choose a playlist</span>
            <select
              value={uploadPlaylistId}
              onChange={(e) => onScanPlaylist(e.target.value)}
              className="rounded border border-sky-300 bg-white px-2 py-1 text-xs dark:border-sky-700 dark:bg-zinc-900"
            >
              <option value="" disabled>
                Select…
              </option>
              {uploadScan.playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!isByo && uploadDiffs ? (
          uploadDiffMatched ? (
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Playlist matches expected presentation.
            </p>
          ) : (
            <div>
              <p className="text-xs font-medium text-amber-900 dark:text-amber-300">
                Differences detected — upload incomplete likely:
              </p>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-amber-900 dark:text-amber-200">
                {uploadDiffs.slice(0, 12).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )
        ) : isByo ? (
          <p className="text-xs opacity-70">BYO upload — PCO diff optional.</p>
        ) : (
          <p className="text-xs opacity-70">Select playlist to compare.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={uploadBusy || !canComplete}
          onClick={onUploadComplete}
          className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-600"
        >
          {uploadBusy ? "Uploading…" : "Upload complete"}
        </button>
        <button
          type="button"
          disabled={uploadBusy || !uploadScan?.selected}
          onClick={onUploadIncomplete}
          className="h-11 rounded-xl bg-amber-700 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-amber-600"
        >
          Upload incomplete
        </button>
        <button
          type="button"
          disabled={uploadBusy}
          onClick={onCancel}
          className="h-11 rounded-xl border px-4 text-sm dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
