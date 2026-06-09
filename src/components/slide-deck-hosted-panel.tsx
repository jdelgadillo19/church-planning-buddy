"use client";

import {
  ambiguousSongRows,
  SlideDeckLibraryDisambiguation,
  unresolvedAmbiguousRows,
} from "@/components/slide-deck-library-match";
import { SlideDeckRigAdmin } from "@/components/slide-deck-rig-admin";
import { buildStatusTone, formatBuildStatus } from "@/lib/slide-deck/build-status";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";

type BuildJob = {
  id: string;
  status: string;
  rig_id?: string | null;
  error_message?: string | null;
  created_at?: string;
  change_summary?: string | null;
  result?: { publish?: { driveFolderUrl?: string }; publishWarning?: string } | null;
};

type Rig = {
  id: string;
  displayName: string;
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
  rigs: Rig[];
  orgId: string | null;
  isAdmin: boolean;
  queueBusy: boolean;
  onQueueBuild: () => void;
  onRefreshBuilds: () => void;
  onRigsChange: () => void;
  onSelectLibrary: (position: number, itemId: string) => void;
  proplaylistFile: File | null;
  onProplaylistFileChange: (file: File | null) => void;
};

function cliApplyCommand(planId: string, serviceTypeId: string) {
  const st = serviceTypeId.trim() ? ` --service-type-id=${serviceTypeId.trim()}` : "";
  return `npm run slide-deck:apply -- ${planId.trim()}${st}`;
}

function cliPublishCommand(planId: string, serviceTypeId: string) {
  const st = serviceTypeId.trim() ? ` --service-type-id=${serviceTypeId.trim()}` : "";
  return `npm run slide-deck:publish -- ${planId.trim()}${st}`;
}

export function SlideDeckHostedPanel({
  planId,
  serviceTypeId,
  manifest,
  commitPlan,
  librarySelections,
  indexMeta,
  builds,
  rigs,
  orgId,
  isAdmin,
  queueBusy,
  onQueueBuild,
  onRefreshBuilds,
  onRigsChange,
  onSelectLibrary,
  proplaylistFile,
  onProplaylistFileChange,
}: Props) {
  const rigNameById = new Map(rigs.map((r) => [r.id, r.displayName]));
  const ambiguousRows = ambiguousSongRows(commitPlan);
  const unresolvedRows = unresolvedAmbiguousRows(commitPlan, librarySelections);
  const sendBlocked = !commitPlan || unresolvedRows.length > 0;
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
    <section className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
      <h2 className="text-base font-medium">Send to presentation rig</h2>
      <p>
        Build your preview here, then queue the deck for your church&apos;s presentation Mac.
        Grapevine Rig (installable app, Phase 1) applies the build — no terminal required.
      </p>

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

      <SlideDeckLibraryDisambiguation
        rows={ambiguousRows}
        librarySelections={librarySelections}
        onSelectLibrary={onSelectLibrary}
      />

      <div className="flex flex-col gap-2">
        {unresolvedRows.length > 0 ? (
          <p className="text-xs text-amber-900 dark:text-amber-100">
            Choose a library variant for {unresolvedRows.length} song(s) above before sending.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={queueBusy || sendBlocked}
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
            presentation Mac.
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
            <p className="font-medium">Mac agent (npm)</p>
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
          After applying on the Mac (or exporting manually), choose the playlist file here, then use
          Publish to Drive (Connect Google first).
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
