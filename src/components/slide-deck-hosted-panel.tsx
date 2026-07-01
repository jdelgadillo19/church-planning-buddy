"use client";

import {
  ambiguousSongRows,
  missingSongRows,
  SlideDeckLibraryDisambiguation,
  SlideDeckMissingSongs,
  unresolvedAmbiguousRows,
} from "@/components/slide-deck-library-match";
import { SlideDeckRigAdmin } from "@/components/slide-deck-rig-admin";
import { buildStatusTone, formatBuildStatus } from "@/lib/slide-deck/build-status";
import type { ImplementationPlan } from "@/lib/slide-deck/implementation-plan";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { MergeConflict } from "@/lib/slide-deck/plan-merge";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";

type BuildJob = {
  id: string;
  status: string;
  rig_id?: string | null;
  error_message?: string | null;
  created_at?: string;
  completed_at?: string | null;
  plan_id?: string;
  service_type_id?: string | null;
  commit_plan?: MockCommitPlan;
  change_summary?: string | null;
  result?: { publish?: { driveFolderUrl?: string }; publishWarning?: string } | null;
};

type SubmissionDraft = {
  id: string;
  created_by: string;
  created_at: string;
  change_summary: string | null;
  status: string;
  commit_plan?: MockCommitPlan;
  manifest?: SlideDeckManifest | null;
  library_selections?: Record<string, string>;
};

type Rig = {
  id: string;
  displayName: string;
  rigKind?: string;
  lastSeenAt: string | null;
};

type IndexMeta = {
  rigName: string;
  snapshotAt: string;
  libraryItemCount: number;
  stale: boolean;
  hasLibraryIndex: boolean;
} | null;

type Props = {
  planId: string;
  serviceTypeId: string;
  manifest: SlideDeckManifest | null;
  commitPlan: MockCommitPlan | null;
  librarySelections: Record<string, string>;
  indexMeta: IndexMeta;
  builds: BuildJob[];
  submissions: SubmissionDraft[];
  rigs: Rig[];
  orgId: string | null;
  isAdmin: boolean;
  queueBusy: boolean;
  submitBusy: boolean;
  mergeReview: {
    conflicts: MergeConflict[];
    implementationPlan: ImplementationPlan;
    rowSourceOverrides: Record<string, string>;
  } | null;
  onQueueBuild: () => void;
  onSubmitDraft: () => void;
  onRefreshBuilds: () => void;
  onRefreshSubmissions: () => void;
  onRigsChange: () => void;
  onSelectLibrary: (position: number, itemId: string) => void;
  onMergeSourceChange: (elementKey: string, submissionId: string) => void;
  onConfirmMergeSend: () => void;
  onCancelMergeReview: () => void;
  proplaylistFile: File | null;
  onProplaylistFileChange: (file: File | null) => void;
  pendingRigHandoffs?: Array<{
    id: string;
    playlist_name: string;
    services_drive_url: string | null;
  }>;
};

function cliApplyCommand(planId: string, serviceTypeId: string) {
  const st = serviceTypeId.trim() ? ` --service-type-id=${serviceTypeId.trim()}` : "";
  return `npm run slide-deck:apply -- ${planId.trim()}${st}`;
}

function cliPublishCommand(planId: string, serviceTypeId: string) {
  const st = serviceTypeId.trim() ? ` --service-type-id=${serviceTypeId.trim()}` : "";
  return `npm run slide-deck:publish -- ${planId.trim()}${st}`;
}

function formatSubmissionTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function SlideDeckHostedPanel({
  planId,
  serviceTypeId,
  manifest,
  commitPlan,
  librarySelections,
  indexMeta,
  builds,
  submissions,
  rigs,
  orgId,
  isAdmin,
  queueBusy,
  submitBusy,
  mergeReview,
  onQueueBuild,
  onSubmitDraft,
  onRefreshBuilds,
  onRefreshSubmissions,
  onRigsChange,
  onSelectLibrary,
  onMergeSourceChange,
  onConfirmMergeSend,
  onCancelMergeReview,
  proplaylistFile,
  onProplaylistFileChange,
  pendingRigHandoffs = [],
}: Props) {
  const rigNameById = new Map(rigs.map((r) => [r.id, r.displayName]));
  const ambiguousRows = ambiguousSongRows(commitPlan);
  const unresolvedRows = unresolvedAmbiguousRows(commitPlan, librarySelections);
  const missingRows = missingSongRows(commitPlan);
  const sendBlocked = !commitPlan || unresolvedRows.length > 0;
  const draftCount = submissions.length;

  const completedBuilds = builds
    .filter((b) => b.status === "completed" && b.commit_plan?.playlistName === commitPlan?.playlistName)
    .sort((a, b) => {
      const atA = Date.parse(a.completed_at ?? a.created_at ?? "");
      const atB = Date.parse(b.completed_at ?? b.created_at ?? "");
      return Number.isFinite(atB - atA) ? atB - atA : 0;
    });

  const latestDraft = [...submissions].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  const latestDraftMissing = latestDraft?.commit_plan ? missingSongRows(latestDraft.commit_plan) : [];
  const latestDraftUnresolved = latestDraft?.commit_plan
    ? unresolvedAmbiguousRows(latestDraft.commit_plan, latestDraft.library_selections ?? {})
    : [];

  function downloadBundle() {
    if (!manifest || !commitPlan) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            planId: planId.trim(),
            serviceTypeId: serviceTypeId.trim() || undefined,
            manifest,
            commitPlan,
            librarySelections,
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slide-deck-${planId.trim()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const latestBuild = builds[0];
  const latestTone = latestBuild ? buildStatusTone(latestBuild.status) : "neutral";

  return (
    <>
      <SlideDeckRigAdmin
        orgId={orgId}
        isAdmin={isAdmin}
        rigs={rigs}
        onRigsChange={onRigsChange}
      />

      {pendingRigHandoffs.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/40 p-4 text-sm dark:border-violet-900 dark:bg-violet-950/30">
          <h3 className="font-medium">Pending rig handoffs</h3>
          <p className="text-xs opacity-90">
            Complete remote-prep uploads awaiting import on the presentation rig.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {pendingRigHandoffs.slice(0, 5).map((h) => (
              <li key={h.id}>
                {h.playlist_name}
                {h.services_drive_url ? (
                  <>
                    {" "}
                    —{" "}
                    <a
                      href={h.services_drive_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Drive package
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    <section className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
      <h2 className="text-base font-medium">Send to presentation rig</h2>
      <p>
        Build your preview, <strong>submit a draft</strong> to save your row-level plan, then{" "}
        <strong>send to rig</strong> when ready. Multiple planners can submit; Send merges drafts
        automatically when there are no conflicts.
      </p>

      {completedBuilds.length > 0 ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-medium">Complete presentation exists</p>
          <p className="mt-1">
            Most recent build:{" "}
            <span className="font-mono">{completedBuilds[0]?.id.slice(0, 8)}…</span> —{" "}
            {completedBuilds[0]?.completed_at
              ? new Date(completedBuilds[0]!.completed_at!).toLocaleString()
              : "completed"}
          </p>
        </div>
      ) : null}

      {draftCount > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Incomplete submissions exist</p>
          <p className="mt-1">
            Latest draft missing{" "}
            <span className="font-mono">
              {latestDraftMissing.length} song(s){latestDraftUnresolved.length > 0 ? " + variant selections" : ""}
            </span>
            .
          </p>
          {latestDraftMissing.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {latestDraftMissing.slice(0, 5).map((r) => (
                <li key={r.position}>{r.pcoTitle ?? r.name}</li>
              ))}
              {latestDraftMissing.length > 5 ? <li>…</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {indexMeta ? (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            indexMeta.stale
              ? "border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
              : indexMeta.hasLibraryIndex
                ? "border border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                : "border border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          Library index from <strong>{indexMeta.rigName}</strong> —{" "}
          {indexMeta.libraryItemCount} songs, updated{" "}
          {new Date(indexMeta.snapshotAt).toLocaleString()}
          {indexMeta.stale ? " (stale — run Scan now in Grapevine Rig)" : null}
        </p>
      ) : (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
          No library index yet. On the presentation Mac open Grapevine Rig and click{" "}
          <strong>Scan now</strong> (or see <code className="font-mono">docs/INSTALL-GRAPEVINE-RIG.md</code>)
          so previews can match songs.
        </p>
      )}

      {commitPlan?.warnings?.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
          <p className="font-medium">Preview warnings</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-90">
            {commitPlan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <SlideDeckMissingSongs rows={missingRows} />

      <SlideDeckLibraryDisambiguation
        rows={ambiguousRows}
        librarySelections={librarySelections}
        onSelectLibrary={onSelectLibrary}
      />

      {draftCount > 0 ? (
        <div className="rounded-lg border border-sky-300/60 bg-white/50 px-3 py-2 dark:border-sky-800 dark:bg-sky-900/30">
          <p className="text-xs font-medium">Draft submissions for this service ({draftCount})</p>
          <ul className="mt-1 space-y-1 text-xs opacity-90">
            {submissions.map((s) => (
              <li key={s.id}>
                <span className="font-mono">{s.id.slice(0, 8)}…</span> —{" "}
                {s.change_summary ?? "Draft"} — {formatSubmissionTime(s.created_at)}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={queueBusy}
            onClick={onRefreshSubmissions}
            className="mt-2 text-xs underline opacity-80"
          >
            Refresh drafts
          </button>
        </div>
      ) : null}

      {mergeReview ? (
        <div className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-3 dark:border-amber-700 dark:bg-amber-950/50">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            Merge review required ({mergeReview.conflicts.length} conflict
            {mergeReview.conflicts.length === 1 ? "" : "s"})
          </p>
          <p className="mt-1 text-xs opacity-90">
            Multiple drafts changed the same playlist rows. Pick which submission wins for each row,
            then confirm send.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {mergeReview.conflicts.map((conflict) => {
              const selected =
                mergeReview.rowSourceOverrides[conflict.elementKey] ??
                conflict.candidates[0]?.submissionId ??
                "";
              const rowName =
                conflict.candidates.find((c) => c.submissionId === selected)?.row.name ??
                conflict.elementKey;
              return (
                <li
                  key={conflict.elementKey}
                  className="flex flex-col gap-1 rounded border border-amber-300/60 bg-white/60 px-2 py-2 dark:border-amber-800 dark:bg-amber-950/30"
                >
                  <span className="text-xs font-medium">{rowName}</span>
                  <span className="font-mono text-[10px] opacity-70">{conflict.elementKey}</span>
                  <select
                    value={selected}
                    onChange={(e) => onMergeSourceChange(conflict.elementKey, e.target.value)}
                    className="rounded border border-amber-400 bg-white px-2 py-1 text-xs dark:border-amber-700 dark:bg-zinc-900"
                  >
                    {conflict.candidates.map((c) => (
                      <option key={c.submissionId} value={c.submissionId}>
                        {c.row.name} — score {c.changeScore} —{" "}
                        {formatSubmissionTime(c.createdAt)}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={queueBusy}
              onClick={onConfirmMergeSend}
              className="h-9 rounded-lg bg-amber-800 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-amber-700"
            >
              {queueBusy ? "Sending…" : "Confirm and send to rig"}
            </button>
            <button
              type="button"
              disabled={queueBusy}
              onClick={onCancelMergeReview}
              className="h-9 rounded-lg border border-amber-700 px-3 text-xs dark:border-amber-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {missingRows.length > 0 ? (
          <p className="text-xs text-amber-900 dark:text-amber-100">
            {missingRows.length} element(s) not in the filebase will be skipped when building.
            Add them to ProPresenter and re-scan to include them.
          </p>
        ) : null}
        {unresolvedRows.length > 0 ? (
          <p className="text-xs text-amber-900 dark:text-amber-100">
            Choose a library variant for {unresolvedRows.length} song(s) above before sending.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitBusy || sendBlocked}
            onClick={onSubmitDraft}
            className="h-11 rounded-lg border border-sky-700 px-4 text-sm font-medium dark:border-sky-500 disabled:opacity-50"
          >
            {submitBusy ? "Submitting draft…" : "Submit draft"}
          </button>
          <button
            type="button"
            disabled={queueBusy || sendBlocked || Boolean(mergeReview)}
            onClick={onQueueBuild}
            className="h-11 rounded-lg bg-sky-800 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-sky-600"
          >
            {queueBusy ? "Sending to rig…" : "Send to presentation rig"}
          </button>
          <button
            type="button"
            disabled={queueBusy}
            onClick={onRefreshBuilds}
            className="h-11 rounded-lg border border-sky-700 px-4 text-sm dark:border-sky-500 disabled:opacity-50"
          >
            {queueBusy ? "Refreshing…" : "Refresh status"}
          </button>
        </div>
        {latestBuild ? (
          <p
            className={`text-xs rounded-lg px-3 py-2 ${
              latestTone === "ok"
                ? "border border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                : latestTone === "error"
                  ? "border border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
                  : latestTone === "active"
                    ? "border border-sky-300 bg-sky-100/80 dark:border-sky-700 dark:bg-sky-900/40"
                    : "border border-zinc-300 bg-white/60 dark:border-zinc-700 dark:bg-zinc-900/40"
            }`}
          >
            Build <span className="font-mono">{latestBuild.id.slice(0, 8)}…</span> —{" "}
            <strong>{formatBuildStatus(latestBuild.status)}</strong>
            {latestBuild.rig_id && rigNameById.get(latestBuild.rig_id) ? (
              <> on <strong>{rigNameById.get(latestBuild.rig_id)}</strong></>
            ) : null}
            {latestBuild.change_summary ? ` — ${latestBuild.change_summary}` : null}
            {latestBuild.error_message ? ` — ${latestBuild.error_message}` : null}
            {latestBuild.status === "completed" && latestBuild.result?.publishWarning ? (
              <> — {latestBuild.result.publishWarning}</>
            ) : null}
            {latestBuild.result?.publish?.driveFolderUrl ? (
              <>
                {" "}
                —{" "}
                <a
                  href={latestBuild.result.publish.driveFolderUrl}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Drive folder
                </a>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs opacity-80">
            After sending, status updates here. The rig applies when Grapevine Rig is running on the
            presentation computer.
          </p>
        )}
      </div>

      <details className="rounded-lg border border-sky-300/60 p-3 dark:border-sky-800">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced / troubleshooting (debug only)
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-xs opacity-90">
          <p>
            Interim paths below are deprecated for operators. See{" "}
            <code className="font-mono">docs/SLIDE-DECK-DEPRECATION.md</code>.
          </p>
          <div>
            <p className="font-medium">Dev agent (npm, deprecated)</p>
            <code className="font-mono">npm run slide-deck:agent</code>
          </div>
          <div>
            <p className="font-medium">CLI apply / publish</p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-sky-100/80 p-2 font-mono dark:bg-sky-900/50">
              {planId.trim() ? cliApplyCommand(planId, serviceTypeId) : "npm run slide-deck:apply -- <planId>"}
              {"\n"}
              {planId.trim()
                ? cliPublishCommand(planId, serviceTypeId)
                : "npm run slide-deck:publish -- <planId>"}
            </pre>
          </div>
          {manifest && commitPlan ? (
            <button
              type="button"
              onClick={downloadBundle}
              className="h-9 w-fit rounded-lg border border-sky-700 px-3 text-sm dark:border-sky-500"
            >
              Download manifest JSON
            </button>
          ) : null}
        </div>
      </details>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Emergency — upload .proplaylist for Drive publish</h3>
        <p className="text-xs opacity-90">
          After applying on the presentation rig (or exporting manually), choose the playlist file
          here, then use Publish to Drive (Connect Google first).
        </p>
        <input
          type="file"
          accept=".proplaylist,application/octet-stream"
          onChange={(e) => onProplaylistFileChange(e.target.files?.[0] ?? null)}
          className="text-xs"
        />
        {proplaylistFile ? (
          <p className="text-xs font-mono">Selected: {proplaylistFile.name}</p>
        ) : null}
      </div>
    </section>
    </>
  );
}
