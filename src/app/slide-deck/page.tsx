"use client";

import { useCallback, useEffect, useState } from "react";
import { ToolShell } from "@/components/tool-shell";
import type { SlideDeckManifest, ManifestElement } from "@/lib/slide-deck/types";
import type { MockCommitPlan, MockCommitOperation, MockCommitPlaylistRow } from "@/lib/slide-deck/mock-commit";

const STEPS = ["Setup", "Commit preview"] as const;
type Step = (typeof STEPS)[number];

type PpStatus = {
  connected: boolean;
  error?: string;
  allowWrites?: boolean;
};

export default function SlideDeckPage() {
  const [step, setStep] = useState<Step>("Setup");
  const [planId, setPlanId] = useState("87788328");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<SlideDeckManifest | null>(null);
  const [commitPlan, setCommitPlan] = useState<MockCommitPlan | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    playlistId: string;
    playlistName: string;
    itemCount: number;
    items: { position: number; name: string }[];
    warnings: string[];
  } | null>(null);
  const [ppStatus, setPpStatus] = useState<PpStatus | null>(null);

  const refreshPpStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/propresenter/status");
      const data = (await res.json()) as PpStatus & { ok?: boolean };
      setPpStatus({
        connected: Boolean(data.connected),
        error: data.error,
        allowWrites: data.allowWrites,
      });
    } catch {
      setPpStatus({ connected: false, error: "Could not reach ProPresenter status endpoint." });
    }
  }, []);

  useEffect(() => {
    void refreshPpStatus();
  }, [refreshPpStatus]);

  async function loadMockCommit() {
    setLoading(true);
    setError(null);
    setManifest(null);
    setCommitPlan(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/slide-deck/mock-commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: planId.trim() }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        manifest?: SlideDeckManifest;
        commitPlan?: MockCommitPlan;
        error?: string;
      };
      if (!payload.ok || !payload.manifest || !payload.commitPlan) {
        throw new Error(payload.error ?? "Mock commit request failed.");
      }
      setManifest(payload.manifest);
      setCommitPlan(payload.commitPlan);
      setStep("Commit preview");
      void refreshPpStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load mock commit.");
    } finally {
      setLoading(false);
    }
  }

  async function applyToProPresenter() {
    if (!planId.trim() || !commitPlan) return;
    const ok = window.confirm(
      `Apply "${commitPlan.playlistName}" to ProPresenter?\n\nThis creates a new playlist and writes ${commitPlan.playlistPreview.length} items. Requires PP_ALLOW_WRITES=true.`,
    );
    if (!ok) return;

    setApplyLoading(true);
    setError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/slide-deck/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: planId.trim(), confirm: true }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        result?: {
          playlistId: string;
          playlistName: string;
          itemCount: number;
          items: { position: number; name: string }[];
          warnings: string[];
        };
        error?: string;
      };
      if (!payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Apply failed.");
      }
      setApplyResult(payload.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply to ProPresenter failed.");
    } finally {
      setApplyLoading(false);
    }
  }

  return (
    <ToolShell toolId="slide-deck">
      <nav className="flex flex-wrap gap-2" aria-label="Slide deck steps">
        {STEPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (s === "Setup" || commitPlan) setStep(s);
            }}
            disabled={s === "Commit preview" && !commitPlan}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              step === s
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {s}
          </button>
        ))}
      </nav>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <strong>Mock commit — no ProPresenter writes.</strong> Commit preview shows the operations and
        resulting playlist that would run if writes were enabled.
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">ProPresenter</h2>
          {ppStatus ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                ppStatus.connected
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {ppStatus.connected ? "Connected" : "Not connected"}
            </span>
          ) : (
            <span className="text-xs text-zinc-500">Checking…</span>
          )}
        </div>
        {ppStatus && !ppStatus.connected && ppStatus.error ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{ppStatus.error}</p>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {step === "Setup" ? (
        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Planning Center Plan ID</span>
            <input
              type="text"
              inputMode="numeric"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              placeholder="e.g. 87788328"
              className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="button"
            disabled={loading || !planId.trim()}
            onClick={() => void loadMockCommit()}
            className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Building preview…" : "Preview mock commit"}
          </button>
        </section>
      ) : null}

      {step === "Commit preview" && commitPlan && manifest ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Mock commit summary</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Writes blocked
              </span>
            </div>
            <dl className="grid gap-2 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Plan</dt>
                <dd>{commitPlan.planId}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Output playlist</dt>
                <dd className="font-mono">{commitPlan.playlistName}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-zinc-500 dark:text-zinc-400">From template</dt>
                <dd className="font-mono">
                  {commitPlan.templateSource} ({commitPlan.templateItemCount} items)
                </dd>
              </div>
            </dl>
            {commitPlan.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
                {commitPlan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={applyLoading || Boolean(applyResult)}
                onClick={() => void applyToProPresenter()}
                className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-600"
              >
                {applyLoading
                  ? "Applying to ProPresenter…"
                  : applyResult
                    ? "Applied"
                    : "Apply to ProPresenter"}
              </button>
              <button
                type="button"
                onClick={() => setStep("Setup")}
                className="h-11 rounded-xl border px-4 text-sm dark:border-zinc-700"
              >
                ← Change plan
              </button>
            </div>
            {ppStatus && !ppStatus.allowWrites ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Set <code className="font-mono">PP_ALLOW_WRITES=true</code> in .env.local and restart
                the dev server to enable live apply.
              </p>
            ) : null}
          </section>

          {applyResult ? (
            <section className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950">
              <h2 className="text-lg font-medium text-emerald-900 dark:text-emerald-100">
                Live apply complete
              </h2>
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                Created playlist <strong className="font-mono">{applyResult.playlistName}</strong> (
                {applyResult.itemCount} items) — open ProPresenter to verify.
              </p>
              <p className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                {applyResult.playlistId}
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-emerald-900 dark:text-emerald-100">
                {applyResult.items.map((item) => (
                  <li key={item.position}>{item.name}</li>
                ))}
              </ol>
              {applyResult.warnings.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
                  {applyResult.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <OperationsList operations={commitPlan.operations} />

          <CorrespondenceTable correspondences={commitPlan.correspondences} />

          <PlaylistPreview rows={commitPlan.playlistPreview} />

          <ManifestTable
            title="PCO songs included in commit"
            elements={manifest.elements.filter((e) => e.playlistIntent === "include")}
            emptyMessage="No worship songs on this plan."
          />
        </div>
      ) : null}
    </ToolShell>
  );
}

function CorrespondenceTable({
  correspondences,
}: {
  correspondences: MockCommitPlan["correspondences"];
}) {
  if (correspondences.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="border-b border-zinc-200 px-5 py-3 text-sm font-medium dark:border-zinc-800">
        PCO ↔ ProPresenter template correspondence
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">PCO #</th>
              <th className="px-4 py-2 font-medium">PCO item</th>
              <th className="px-4 py-2 font-medium">PP template item</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {correspondences.map((row) => (
              <tr
                key={`${row.pcoOrder}-${row.pcoTitle}`}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="px-4 py-2 tabular-nums text-zinc-500">{row.pcoOrder}</td>
                <td className="px-4 py-2">{row.pcoTitle}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.ppItemName ?? "—"}</td>
                <td className="px-4 py-2 text-xs">
                  <CorrespondenceStatus status={row.status} note={row.note} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CorrespondenceStatus({ status, note }: { status: string; note?: string }) {
  const cls =
    status === "matched"
      ? "text-emerald-700 dark:text-emerald-300"
      : status === "ambiguous"
        ? "text-amber-700 dark:text-amber-300"
        : "text-red-700 dark:text-red-300";
  return (
    <span className={cls} title={note}>
      {status}
      {note ? ` — ${note}` : ""}
    </span>
  );
}

function OperationsList({ operations }: { operations: MockCommitOperation[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="border-b border-zinc-200 px-5 py-3 text-sm font-medium dark:border-zinc-800">
        ProPresenter operations (would run on commit)
      </h2>
      <ol className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {operations.map((op) => (
          <li key={op.step} className="flex flex-col gap-1 px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-500">#{op.step}</span>
              <span className="font-medium">{op.label}</span>
              <OperationStatusBadge status={op.status} />
            </div>
            {op.detail ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{op.detail}</p>
            ) : null}
            {op.apiMethod && op.apiPath ? (
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-500">
                {op.apiMethod} {op.apiPath}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function OperationStatusBadge({ status }: { status: MockCommitOperation["status"] }) {
  const cls =
    status === "planned"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : status === "missing_prerequisite"
        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  const label =
    status === "planned" ? "planned" : status === "missing_prerequisite" ? "blocked" : status;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function PlaylistPreview({ rows }: { rows: MockCommitPlaylistRow[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="border-b border-zinc-200 px-5 py-3 text-sm font-medium dark:border-zinc-800">
        Resulting playlist preview
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Playlist item</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Library match</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.position}-${row.name}`}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="px-4 py-2 tabular-nums text-zinc-500">{row.position}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.kind === "template_inherit"
                        ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    }`}
                  >
                    {row.kind === "template_inherit" ? "template" : "song"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div>{row.name}</div>
                  {row.pcoCorrespondence ? (
                    <div className="text-xs text-sky-700 dark:text-sky-300">
                      PCO: {row.pcoCorrespondence}
                    </div>
                  ) : null}
                  {row.pcoTitle && row.kind === "song_add" ? (
                    <div className="text-xs text-zinc-500">
                      PCO: {row.pcoTitle}
                      {row.key ? ` · ${row.key}` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">{row.source}</td>
                <td className="px-4 py-2 text-xs">
                  {row.libraryMatch ? (
                    <LibraryMatchCell match={row.libraryMatch} />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LibraryMatchCell({ match }: { match: NonNullable<MockCommitPlaylistRow["libraryMatch"]> }) {
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

function ManifestTable({
  title,
  elements,
  emptyMessage,
}: {
  title: string;
  elements: ManifestElement[];
  emptyMessage: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="border-b border-zinc-200 px-5 py-3 text-sm font-medium dark:border-zinc-800">
        {title}
      </h2>
      {elements.length === 0 ? (
        <p className="px-5 py-4 text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">PCO #</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Key / artist</th>
              </tr>
            </thead>
            <tbody>
              {elements.map((el) => (
                <tr
                  key={el.pcoItemId}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-4 py-2 tabular-nums text-zinc-500">{el.order}</td>
                  <td className="px-4 py-2">{el.pcoTitle}</td>
                  <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {[el.key, el.artist].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
