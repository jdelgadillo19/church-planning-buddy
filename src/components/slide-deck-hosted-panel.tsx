"use client";

import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";

type AgentJob = {
  id: string;
  status: string;
  error_message?: string | null;
  created_at?: string;
  result?: { publish?: { driveFolderUrl?: string } } | null;
};

type Props = {
  planId: string;
  serviceTypeId: string;
  manifest: SlideDeckManifest | null;
  commitPlan: MockCommitPlan | null;
  librarySelections: Record<string, string>;
  agentJobs: AgentJob[];
  agentQueueBusy: boolean;
  onQueueAgent: () => void;
  onRefreshJobs: () => void;
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
  agentJobs,
  agentQueueBusy,
  onQueueAgent,
  onRefreshJobs,
  proplaylistFile,
  onProplaylistFileChange,
}: Props) {
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

  const latestJob = agentJobs[0];

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
      <h2 className="text-base font-medium">Hosted site — operator Mac required</h2>
      <p>
        ProPresenter and AppleScript export only run on the Mac where ProPresenter is open. From
        grapevineprep.com you can preview plans, queue work for the Mac agent, run CLI on the Mac, or
        upload a <code className="font-mono text-xs">.proplaylist</code> for Drive publish.
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Option A — Mac agent (recommended)</h3>
        <p className="text-xs opacity-90">
          On the prep Mac: set <code className="font-mono">SLIDE_DECK_AGENT_TOKEN</code> (same as
          hosted secret), then <code className="font-mono">npm run slide-deck:agent</code>. Queue a
          job after building preview.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={agentQueueBusy || !commitPlan}
            onClick={onQueueAgent}
            className="h-10 rounded-lg bg-sky-800 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-sky-600"
          >
            {agentQueueBusy ? "Queuing…" : "Send to Mac agent"}
          </button>
          <button
            type="button"
            onClick={onRefreshJobs}
            className="h-10 rounded-lg border border-sky-700 px-3 text-sm dark:border-sky-500"
          >
            Refresh job status
          </button>
        </div>
        {latestJob ? (
          <p className="text-xs">
            Latest job: <span className="font-mono">{latestJob.id.slice(0, 8)}…</span> —{" "}
            <strong>{latestJob.status}</strong>
            {latestJob.error_message ? ` — ${latestJob.error_message}` : null}
            {latestJob.result?.publish?.driveFolderUrl ? (
              <>
                {" "}
                —{" "}
                <a
                  href={latestJob.result.publish.driveFolderUrl}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Drive folder
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Option B — CLI on prep Mac</h3>
        <p className="text-xs opacity-90">
          Clone repo on the Mac, copy <code className="font-mono">.env.local</code>, connect Google,
          then run:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-sky-100/80 p-3 font-mono text-xs dark:bg-sky-900/50">
          {planId.trim() ? cliApplyCommand(planId, serviceTypeId) : "npm run slide-deck:apply -- <planId>"}
          {"\n"}
          {planId.trim()
            ? cliPublishCommand(planId, serviceTypeId)
            : "npm run slide-deck:publish -- <planId>"}
        </pre>
        {manifest && commitPlan ? (
          <button
            type="button"
            onClick={downloadBundle}
            className="h-10 w-fit rounded-lg border border-sky-700 px-3 text-sm dark:border-sky-500"
          >
            Download manifest JSON
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Option C — Upload .proplaylist for Drive publish</h3>
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
  );
}
