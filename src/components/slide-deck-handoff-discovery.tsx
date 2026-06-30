"use client";

import {
  defaultHandoffSelection,
  sortHandoffsForDiscovery,
} from "@/lib/slide-deck/handoff";
import type { SlideDeckHandoffSummary } from "@/lib/slide-deck/page-types";

type Props = {
  handoffs: SlideDeckHandoffSummary[];
  authors?: Record<string, { displayName: string; email: string | null }>;
  selectedHandoffId: string | null;
  planLabel?: string;
  onSelectHandoff: (handoff: SlideDeckHandoffSummary) => void;
  onBuildFresh: () => void;
  onDownloadExisting: (handoff: SlideDeckHandoffSummary) => void;
  isAdmin?: boolean;
  onApproveForRig?: (handoffId: string) => void;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function SlideDeckHandoffDiscovery({
  handoffs,
  authors = {},
  selectedHandoffId,
  planLabel,
  onSelectHandoff,
  onBuildFresh,
  onDownloadExisting,
  isAdmin = false,
  onApproveForRig,
}: Props) {
  const sorted = sortHandoffsForDiscovery(handoffs as Parameters<typeof sortHandoffsForDiscovery>[0]);
  const defaultId = defaultHandoffSelection(
    handoffs as Parameters<typeof defaultHandoffSelection>[0],
  )?.id;

  if (handoffs.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium">Weekend presentations</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No submitted playlists for {planLabel ?? "this weekend"} yet. Create a fresh presentation
          below.
        </p>
        <button
          type="button"
          onClick={onBuildFresh}
          className="h-10 w-fit rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Create Presentation
        </button>
      </section>
    );
  }

  const selected =
    sorted.find((h) => h.id === (selectedHandoffId ?? defaultId)) ?? sorted[0]!;
  const authorLabel = authors[selected.created_by]?.displayName ?? selected.created_by.slice(0, 8);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Weekend presentations</h2>
        <button
          type="button"
          onClick={onBuildFresh}
          className="text-sm font-medium text-violet-700 underline dark:text-violet-300"
        >
          Build fresh instead
        </button>
      </div>

      {sorted.some((h) => h.handoff_status === "complete") ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-medium">Complete presentation available</p>
          <p className="mt-1 text-xs opacity-90">
            A complete handoff exists for this weekend. Download it to review, or build fresh.
          </p>
        </div>
      ) : null}

      {sorted.some((h) => h.handoff_status === "incomplete") &&
      !sorted.some((h) => h.handoff_status === "complete") ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Incomplete presentation on file</p>
          <p className="mt-1 text-xs">Missing elements are listed below for the selected upload.</p>
        </div>
      ) : null}

      {sorted.length > 1 ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Submitted playlists</span>
          <select
            value={selected.id}
            onChange={(e) => {
              const row = sorted.find((h) => h.id === e.target.value);
              if (row) onSelectHandoff(row);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {sorted.map((h) => (
              <option key={h.id} value={h.id}>
                {h.handoff_status === "complete" ? "Complete" : "Incomplete"}
                {h.version_label ? ` ${h.version_label}` : ""} — {h.playlist_name} (
                {authors[h.created_by]?.displayName ?? "user"} — {formatTime(h.created_at)})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <span
            className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${
              selected.handoff_status === "complete"
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            {selected.handoff_status === "complete" ? "Complete" : "Incomplete"}
          </span>
          {selected.playlist_name}
          {selected.version_label ? ` (${selected.version_label})` : ""} — {authorLabel} —{" "}
          {formatTime(selected.created_at)}
        </p>
      )}

      {selected.handoff_status === "complete" &&
      selected.rig_handoff_status === "synced" ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-medium">Received by presentation rig</p>
          <p className="mt-1 text-xs opacity-90">
            The sanctuary rig imported this handoff package. Confirm in ProPresenter before
            service.
          </p>
        </div>
      ) : null}

      {selected.handoff_status === "complete" &&
      selected.rig_handoff_status === "awaiting_approval" &&
      isAdmin &&
      onApproveForRig ? (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-950/40">
          <p className="font-medium">Awaiting admin sign-off for rig delivery</p>
          <button
            type="button"
            onClick={() => onApproveForRig(selected.id)}
            className="mt-2 h-10 rounded-xl bg-sky-800 px-4 text-sm font-medium text-white dark:bg-sky-600"
          >
            Approve for presentation rig
          </button>
        </div>
      ) : null}

      {selected.handoff_status === "incomplete" && selected.missing_elements?.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900 dark:text-amber-200">
          {selected.missing_elements.slice(0, 8).map((el, i) => (
            <li key={`${el.kind}-${el.label}-${i}`}>
              {el.kind === "missing_song" ? "Missing song: " : ""}
              {el.kind === "sermon" ? "Missing sermon: " : ""}
              {el.label}
              {el.detail ? ` — ${el.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDownloadExisting(selected)}
          className="h-11 rounded-xl border border-emerald-700 px-4 text-sm font-medium text-emerald-800 dark:border-emerald-500 dark:text-emerald-200"
        >
          Download existing presentation
        </button>
      </div>
    </section>
  );
}
