"use client";

import { PcoServicePlanPicker } from "@/components/pco-service-plan-picker";
import {
  ambiguousSongRows,
  LibraryMatchPicker,
  missingSongRows,
  SlideDeckLibraryDisambiguation,
  SlideDeckMissingSongs,
  unresolvedAmbiguousRows,
} from "@/components/slide-deck-library-match";
import type { CreatePresentationIssue } from "@/lib/slide-deck/commit-guards";
import {
  blockingCreateIssues,
  isBlockingCreateIssue,
} from "@/lib/slide-deck/commit-guards";
import type { MockCommitPlan, MockCommitOperation } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest, ManifestElement } from "@/lib/slide-deck/types";
import {
  PP_LOCAL_APPLY_WRITES_DISABLED_MESSAGE,
  PP_LOCAL_PREP_BUILD_HINT,
  type SlideDeckDeviceMode,
} from "@/lib/slide-deck/device-context";

type PlaylistConflictInfo = {
  playlistId: string;
  playlistName: string;
  itemCount: number;
  items: { position: number; name: string }[];
};

type Props = {
  planId: string;
  serviceTypeId: string;
  setServiceTypeId: (v: string) => void;
  upcomingPlans: Parameters<typeof PcoServicePlanPicker>[0]["upcomingPlans"];
  serviceTypeOptions: Parameters<typeof PcoServicePlanPicker>[0]["serviceTypeOptions"];
  planScope: Parameters<typeof PcoServicePlanPicker>[0]["planScope"];
  selectedPlan: Parameters<typeof PcoServicePlanPicker>[0]["selectedPlan"];
  plansBusy: boolean;
  plansError: string | null;
  selectPlan: Parameters<typeof PcoServicePlanPicker>[0]["onSelectPlan"];
  loadOptions: Parameters<typeof PcoServicePlanPicker>[0]["onLoadOptions"];
  loading: boolean;
  createIssues: CreatePresentationIssue[];
  previewReady: boolean;
  manifest: SlideDeckManifest | null;
  commitPlan: MockCommitPlan | null;
  presentationInstanceId: string | null;
  librarySelections: Record<string, string>;
  onSelectLibrary: (position: number, itemId: string) => void;
  onCreatePresentation: () => void;
  onChangeWeekend: () => void;
  isHosted: boolean;
  deviceMode: SlideDeckDeviceMode;
  canLocalApply: boolean;
  applyLoading: boolean;
  applyResult: {
    playlistId: string;
    playlistName: string;
    itemCount: number;
    items: { position: number; name: string }[];
    warnings: string[];
  } | null;
  onDownloadPresentation: () => void;
  onOpenUploadTool?: () => void;
  onPullFilebase?: () => void;
  filebasePullBusy?: boolean;
  filebasePullMessage?: string | null;
  filebasePullError?: string | null;
  canPullFilebase?: boolean;
  onBuildInClient?: () => void;
  buildInClientBusy?: boolean;
  buildInClientMessage?: string | null;
  buildInClientError?: string | null;
  canBuildInClient?: boolean;
  ppConnected: boolean;
  ppAllowWrites: boolean;
  playlistConflict: PlaylistConflictInfo | null;
  showConflictItems: boolean;
  onConfirmOverwrite: () => void;
  onViewConflict: () => void;
  onCancelConflict: () => void;
};

export function SlideDeckBuilderEditor({
  planId,
  serviceTypeId,
  setServiceTypeId,
  upcomingPlans,
  serviceTypeOptions,
  planScope,
  selectedPlan,
  plansBusy,
  plansError,
  selectPlan,
  loadOptions,
  loading,
  createIssues,
  previewReady,
  manifest,
  commitPlan,
  presentationInstanceId,
  librarySelections,
  onSelectLibrary,
  onCreatePresentation,
  onChangeWeekend,
  isHosted,
  deviceMode,
  canLocalApply,
  applyLoading,
  applyResult,
  onDownloadPresentation,
  onOpenUploadTool,
  onPullFilebase,
  filebasePullBusy = false,
  filebasePullMessage = null,
  filebasePullError = null,
  canPullFilebase = false,
  onBuildInClient,
  buildInClientBusy = false,
  buildInClientMessage = null,
  buildInClientError = null,
  canBuildInClient = false,
  ppConnected,
  ppAllowWrites,
  playlistConflict,
  showConflictItems,
  onConfirmOverwrite,
  onViewConflict,
  onCancelConflict,
}: Props) {
  const missingRows = missingSongRows(commitPlan);
  const ambiguousRows = ambiguousSongRows(commitPlan);
  const unresolvedRows = unresolvedAmbiguousRows(commitPlan, librarySelections);
  const blockingIssues = blockingCreateIssues(createIssues);
  const warningIssues = createIssues.filter((i) => !isBlockingCreateIssue(i));
  const createReady =
    unresolvedRows.length === 0 && blockingIssues.length === 0;

  return (
    <section className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <header>
        <h2 className="text-lg font-medium">Builder / editor</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Select a weekend, review what Grapevine will build, then create a fresh presentation or
          download an existing handoff from above.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          <li>Create Presentation — validate against the sanctuary filebase index</li>
          <li>Review and fix library matches</li>
          <li>Download presentation into local ProPresenter, then open the upload tool after editing</li>
        </ol>
      </header>

      <PcoServicePlanPicker
        planId={planId}
        serviceTypeId={serviceTypeId}
        setServiceTypeId={setServiceTypeId}
        upcomingPlans={upcomingPlans}
        serviceTypeOptions={serviceTypeOptions}
        planScope={planScope}
        selectedPlan={selectedPlan}
        busy={plansBusy}
        error={plansError}
        onSelectPlan={selectPlan}
        onLoadOptions={loadOptions}
        serviceTypeLabel={planScope ? `Plan type — ${planScope.name}` : "Plan type (advanced)"}
        serviceTypeHint="Change only if you need a different scoped service type."
      />

      {blockingIssues.length > 0 ? (
        <ul
          className={`list-disc space-y-1 rounded-lg border pl-5 py-3 text-sm ${
            blockingIssues.every((i) => i.kind === "ambiguous_song")
              ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {blockingIssues.map((issue, i) => (
            <li key={`${issue.kind}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {warningIssues.length > 0 ? (
        <ul className="list-disc space-y-1 rounded-lg border border-amber-300 bg-amber-50 pl-5 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {warningIssues.map((issue, i) => (
            <li key={`warn-${i}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {missingRows.length > 0 ? <SlideDeckMissingSongs rows={missingRows} /> : null}

      {previewReady && ambiguousRows.length > 0 ? (
        <SlideDeckLibraryDisambiguation
          rows={ambiguousRows}
          librarySelections={librarySelections}
          onSelectLibrary={onSelectLibrary}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || plansBusy || !planId.trim()}
          onClick={onCreatePresentation}
          className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Creating…" : "Create Presentation"}
        </button>
        {previewReady ? (
          <button
            type="button"
            onClick={onChangeWeekend}
            className="h-11 rounded-xl border px-4 text-sm dark:border-zinc-700"
          >
            Change weekend
          </button>
        ) : null}
      </div>

      {previewReady && commitPlan && manifest ? (
        <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-medium">What Grapevine will build</h3>
            {presentationInstanceId ? (
              <span className="font-mono text-xs text-zinc-500" title="Fresh deck instance">
                {presentationInstanceId.slice(0, 8)}…
              </span>
            ) : null}
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-zinc-500">Output playlist</dt>
              <dd className="font-mono">{commitPlan.playlistName}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-zinc-500">Template</dt>
              <dd className="font-mono">
                {commitPlan.templateSource} ({commitPlan.templateItemCount} items)
              </dd>
            </div>
          </dl>

          {!isHosted ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={applyLoading || !createReady || !canLocalApply}
                onClick={onDownloadPresentation}
                className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-600"
              >
                {applyLoading
                  ? "Downloading…"
                  : applyResult
                    ? "Downloaded (ready to edit)"
                    : "3. Download presentation"}
              </button>
              {applyResult && onOpenUploadTool ? (
                <button
                  type="button"
                  onClick={onOpenUploadTool}
                  className="h-11 rounded-xl border border-violet-700 px-4 text-sm font-medium text-violet-800 dark:border-violet-500 dark:text-violet-200"
                >
                  Open upload tool
                </button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-sky-800 dark:text-sky-200">
                ProPresenter is not available in the browser. Use Send to presentation rig below for
                sanctuary apply.
              </p>
              {canPullFilebase && onPullFilebase ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={filebasePullBusy}
                    onClick={onPullFilebase}
                    className="h-10 w-fit rounded-xl border border-sky-700 px-3 text-sm font-medium text-sky-900 dark:border-sky-500 dark:text-sky-100"
                  >
                    {filebasePullBusy ? "Preparing zip…" : "Pull filebase files"}
                  </button>
                  {filebasePullError ? (
                    <p className="text-xs text-red-700 dark:text-red-300">{filebasePullError}</p>
                  ) : null}
                  {filebasePullMessage ? (
                    <p className="text-xs text-emerald-800 dark:text-emerald-200">{filebasePullMessage}</p>
                  ) : null}
                </div>
              ) : null}
              {canBuildInClient && onBuildInClient ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    disabled={buildInClientBusy || blockingIssues.length > 0}
                    onClick={onBuildInClient}
                    className="h-11 w-fit rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                  >
                    {buildInClientBusy ? "Starting Grapevine Client…" : "Build in Grapevine Client"}
                  </button>
                  <p className="text-xs text-sky-800 dark:text-sky-200">
                    Opens Grapevine Client on this Mac, pulls filebase assets, and builds the ordered
                    playlist in ProPresenter automatically.
                  </p>
                  {buildInClientError ? (
                    <p className="text-xs text-red-700 dark:text-red-300">{buildInClientError}</p>
                  ) : null}
                  {buildInClientMessage ? (
                    <p className="text-xs text-emerald-800 dark:text-emerald-200">{buildInClientMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {deviceMode === "local_prep" || deviceMode === "dev_local" ? (
            <p className="text-xs text-violet-900 dark:text-violet-200">{PP_LOCAL_PREP_BUILD_HINT}</p>
          ) : !ppConnected && !isHosted ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ProPresenter not reachable — use grapevineprep.com Send to rig, or run on a prep machine.
            </p>
          ) : !ppAllowWrites && !isHosted ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {PP_LOCAL_APPLY_WRITES_DISABLED_MESSAGE}
            </p>
          ) : null}

          {playlistConflict ? (
            <ConflictPanel
              conflict={playlistConflict}
              showItems={showConflictItems}
              applyLoading={applyLoading}
              onOverwrite={onConfirmOverwrite}
              onView={onViewConflict}
              onCancel={onCancelConflict}
            />
          ) : null}

          <OperationsList operations={commitPlan.operations} />
          <CorrespondenceTable correspondences={commitPlan.correspondences} />
          <PlaylistPreview
            rows={commitPlan.playlistPreview}
            librarySelections={librarySelections}
            onSelectLibrary={onSelectLibrary}
          />
          <ManifestTable
            title="PCO songs included"
            elements={manifest.elements.filter((e) => e.playlistIntent === "include")}
            emptyMessage="No worship songs on this plan."
          />
        </div>
      ) : null}
    </section>
  );
}

function ConflictPanel({
  conflict,
  showItems,
  applyLoading,
  onOverwrite,
  onView,
  onCancel,
}: {
  conflict: PlaylistConflictInfo;
  showItems: boolean;
  applyLoading: boolean;
  onOverwrite: () => void;
  onView: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
      <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">Existing playlist</h3>
      <p className="text-sm text-red-800 dark:text-red-200">
        <strong className="font-mono">{conflict.playlistName}</strong> already exists (
        {conflict.itemCount} items).
      </p>
      {showItems && conflict.items.length > 0 ? (
        <ol className="max-h-48 list-decimal overflow-y-auto space-y-1 pl-5 text-sm">
          {conflict.items.map((item) => (
            <li key={item.position}>{item.name}</li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="h-9 rounded-lg bg-red-800 px-3 text-sm text-white"
          disabled={applyLoading}
          onClick={onOverwrite}
        >
          Overwrite
        </button>
        <button type="button" className="h-9 rounded-lg border px-3 text-sm" onClick={onView}>
          View
        </button>
        <button type="button" className="h-9 rounded-lg border px-3 text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function OperationsList({ operations }: { operations: MockCommitOperation[] }) {
  if (operations.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <h3 className="border-b border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-800">
        Planned operations
      </h3>
      <ol className="list-decimal space-y-1 px-4 py-3 pl-8 text-sm">
        {operations.map((op) => (
          <li key={op.step} className={op.status !== "planned" ? "text-amber-800 dark:text-amber-200" : ""}>
            {op.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CorrespondenceTable({ correspondences }: { correspondences: MockCommitPlan["correspondences"] }) {
  if (correspondences.length === 0) return null;
  return (
    <section className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2">PCO</th>
            <th className="px-3 py-2">PP item</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {correspondences.map((c) => (
            <tr key={`${c.pcoTitle}-${c.pcoOrder}`} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="px-3 py-2">{c.pcoTitle}</td>
              <td className="px-3 py-2">{c.ppItemName ?? "—"}</td>
              <td className="px-3 py-2">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PlaylistPreview({
  rows,
  librarySelections,
  onSelectLibrary,
}: {
  rows: MockCommitPlan["playlistPreview"];
  librarySelections: Record<string, string>;
  onSelectLibrary: (position: number, itemId: string) => void;
}) {
  return (
    <section className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <h3 className="border-b border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-800">
        Playlist preview
      </h3>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Library</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.position} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="px-3 py-2">{row.position}</td>
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2 text-zinc-500">{row.source}</td>
              <td className="px-3 py-2 text-xs">
                {row.libraryMatch ? (
                  <LibraryMatchPicker
                    match={row.libraryMatch}
                    selectedId={librarySelections[String(row.position)]}
                    onSelect={(itemId) => onSelectLibrary(row.position, itemId)}
                  />
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ManifestTable({
  title,
  elements,
  emptyMessage,
}: {
  title: string;
  elements: ManifestElement[];
  emptyMessage: string;
}) {
  if (elements.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyMessage}</p>;
  }
  return (
    <section className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <h3 className="border-b border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-800">
        {title}
      </h3>
      <table className="w-full text-left text-sm">
        <tbody>
          {elements.map((el) => (
            <tr key={`${el.pcoTitle}-${el.order}`} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="px-3 py-2">{el.pcoTitle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
