"use client";

import type { MockCommitPlaylistRow } from "@/lib/slide-deck/mock-commit";
import {
  missingSongRows,
  unresolvedAmbiguousRows as unresolvedAmbiguousRowsGuard,
} from "@/lib/slide-deck/commit-guards";
import type { LibraryMatchResult } from "@/lib/propresenter/library-read";

export { missingSongRows };

export function unresolvedAmbiguousRows(
  commitPlan: { playlistPreview: MockCommitPlaylistRow[] } | null,
  librarySelections: Record<string, string>,
): MockCommitPlaylistRow[] {
  return unresolvedAmbiguousRowsGuard(commitPlan, librarySelections);
}

export function ambiguousSongRows(
  commitPlan: { playlistPreview: MockCommitPlaylistRow[] } | null,
): MockCommitPlaylistRow[] {
  if (!commitPlan) return [];
  return commitPlan.playlistPreview.filter(
    (row) => row.kind === "song_add" && row.libraryMatch?.status === "ambiguous",
  );
}

export function LibraryMatchPicker({
  match,
  selectedId,
  onSelect,
}: {
  match: LibraryMatchResult;
  selectedId?: string;
  onSelect?: (itemId: string) => void;
}) {
  if (match.status === "ambiguous" && match.candidates?.length) {
    const selected = match.candidates.find((c) => c.id === selectedId);
    return (
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Library variants">
        <span className="text-amber-800 dark:text-amber-200">{match.note}</span>
        {match.candidates.map((candidate) => {
          const active = selectedId === candidate.id;
          return (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect?.(candidate.id)}
              className={`rounded-lg border px-2 py-1.5 text-left text-xs ${
                active
                  ? "border-amber-600 bg-amber-100 font-medium text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100"
                  : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              {candidate.name}
              <span className="block text-zinc-500 dark:text-zinc-400">{candidate.libraryName}</span>
            </button>
          );
        })}
        {selected ? (
          <span className="text-emerald-700 dark:text-emerald-300">Selected: {selected.name}</span>
        ) : null}
      </div>
    );
  }
  if (match.status === "found") {
    return (
      <span className="text-emerald-700 dark:text-emerald-300">
        Found{match.item ? `: ${match.item.name}` : ""}
      </span>
    );
  }
  if (match.status === "unchecked") {
    return <span className="text-zinc-500">{match.note ?? "Not checked"}</span>;
  }
  return (
    <span className="text-red-700 dark:text-red-300" title={match.note}>
      Not found{match.note ? ` — ${match.note}` : ""}
    </span>
  );
}

export function SlideDeckMissingSongs({
  rows,
}: {
  rows: MockCommitPlaylistRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div>
        <h3 className="text-sm font-medium text-amber-950 dark:text-amber-100">
          Elements missing from ProPresenter library
        </h3>
        <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/80">
          These plan items have no library match and will be skipped when building the playlist.
          Add matching presentations in ProPresenter and run <strong>Scan now</strong> on the rig
          to include them next time.
        </p>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950 dark:text-amber-100">
        {rows.map((row) => (
          <li key={row.position}>{row.pcoTitle ?? row.name}</li>
        ))}
      </ul>
    </section>
  );
}

export function SlideDeckLibraryDisambiguation({
  rows,
  librarySelections,
  onSelectLibrary,
}: {
  rows: MockCommitPlaylistRow[];
  librarySelections: Record<string, string>;
  onSelectLibrary: (position: number, itemId: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div>
        <h3 className="text-sm font-medium text-amber-950 dark:text-amber-100">
          Choose ProPresenter song file
        </h3>
        <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/80">
          Multiple library files match the same song title. Pick the correct variant before sending
          to the rig.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.position}
            className="rounded-lg border border-amber-200 bg-white/70 p-3 dark:border-amber-900 dark:bg-zinc-950/50"
          >
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {row.pcoTitle ?? row.name}
              {row.key ? <span className="font-normal text-zinc-500"> · {row.key}</span> : null}
            </p>
            {row.libraryMatch ? (
              <div className="mt-2">
                <LibraryMatchPicker
                  match={row.libraryMatch}
                  selectedId={librarySelections[String(row.position)]}
                  onSelect={(itemId) => onSelectLibrary(row.position, itemId)}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
