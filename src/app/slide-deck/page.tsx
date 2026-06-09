"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleConnectionCard } from "@/components/google-connection-card";
import { PcoServicePlanPicker } from "@/components/pco-service-plan-picker";
import {
  LibraryMatchPicker,
  unresolvedAmbiguousRows,
} from "@/components/slide-deck-library-match";
import { SlideDeckHostedPanel } from "@/components/slide-deck-hosted-panel";
import { ToolShell } from "@/components/tool-shell";
import { useGoogleConnection } from "@/hooks/use-google-connection";
import { usePcoServicePlanSelection } from "@/hooks/use-pco-service-plan-selection";
import type { SlideDeckManifest, ManifestElement } from "@/lib/slide-deck/types";
import type { MockCommitPlan, MockCommitOperation, MockCommitPlaylistRow } from "@/lib/slide-deck/mock-commit";

const STEPS = ["Setup", "Commit preview"] as const;
type Step = (typeof STEPS)[number];

type PpStatus = {
  connected: boolean;
  hosted?: boolean;
  error?: string;
  allowWrites?: boolean;
};

type PlaylistConflictInfo = {
  playlistId: string;
  playlistName: string;
  itemCount: number;
  items: { position: number; name: string }[];
};

export default function SlideDeckPage() {
  const [step, setStep] = useState<Step>("Setup");
  const {
    planId,
    serviceTypeId,
    setServiceTypeId,
    serviceTypeOptions,
    planScope,
    upcomingPlans,
    busy: plansBusy,
    error: plansError,
    selectedPlan,
    loadOptions,
    selectPlan,
  } = usePcoServicePlanSelection();
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
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    serviceFolderKey: string;
    packageId: string;
    driveFolderUrl: string;
    fileCount: number;
    newFileCount: number;
  } | null>(null);
  const { connected: googleConnected } = useGoogleConnection();
  const [ppStatus, setPpStatus] = useState<PpStatus | null>(null);
  const [playlistConflict, setPlaylistConflict] = useState<PlaylistConflictInfo | null>(null);
  const [showConflictItems, setShowConflictItems] = useState(false);
  const [librarySelections, setLibrarySelections] = useState<Record<string, string>>({});
  const [livePlaylistHint, setLivePlaylistHint] = useState<{
    playlistName: string;
    itemCount: number;
  } | null>(null);
  const [proplaylistFile, setProplaylistFile] = useState<File | null>(null);
  const [platformIndex, setPlatformIndex] = useState<{
    rigName: string;
    snapshotAt: string;
    libraryItemCount: number;
    stale: boolean;
    hasLibraryIndex: boolean;
  } | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [rigs, setRigs] = useState<
    Array<{ id: string; displayName: string; lastSeenAt: string | null }>
  >([]);
  const [builds, setBuilds] = useState<
    Array<{
      id: string;
      status: string;
      error_message?: string | null;
      change_summary?: string | null;
      created_at?: string;
      result?: { publish?: { driveFolderUrl?: string } } | null;
    }>
  >([]);
  const [queueBusy, setQueueBusy] = useState(false);

  const isHosted = Boolean(ppStatus?.hosted);
  const canPublishOnHosted = Boolean(proplaylistFile);
  const canLocalApply = Boolean(ppStatus?.connected && ppStatus?.allowWrites);
  const publishDisabled =
    publishLoading ||
    !googleConnected ||
    !planId.trim() ||
    (isHosted && !canPublishOnHosted);

  const refreshPublishPreflight = useCallback(async () => {
    if (!planId.trim()) {
      setLivePlaylistHint(null);
      return;
    }
    try {
      const params = new URLSearchParams({ planId: planId.trim() });
      if (serviceTypeId.trim()) params.set("serviceTypeId", serviceTypeId.trim());
      if (commitPlan?.playlistName) params.set("playlistName", commitPlan.playlistName);
      const res = await fetch(`/api/slide-deck/publish/preflight?${params}`);
      const data = (await res.json()) as {
        ok?: boolean;
        playlistName?: string;
        livePlaylist?: { exists?: boolean; itemCount?: number };
      };
      if (data.ok && data.livePlaylist?.exists && data.playlistName) {
        setLivePlaylistHint({
          playlistName: data.playlistName,
          itemCount: data.livePlaylist.itemCount ?? 0,
        });
      } else {
        setLivePlaylistHint(null);
      }
    } catch {
      setLivePlaylistHint(null);
    }
  }, [planId, serviceTypeId, commitPlan?.playlistName]);

  const unresolvedLibraryRows = useMemo(
    () => unresolvedAmbiguousRows(commitPlan, librarySelections),
    [commitPlan, librarySelections],
  );

  const refreshPpStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/propresenter/status");
      const data = (await res.json()) as PpStatus & { ok?: boolean };
      setPpStatus({
        connected: Boolean(data.connected),
        hosted: data.hosted,
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

  useEffect(() => {
    void refreshPublishPreflight();
  }, [refreshPublishPreflight]);

  const refreshPlatformContext = useCallback(async () => {
    try {
      const res = await fetch("/api/pp/context");
      const data = (await res.json()) as {
        ok?: boolean;
        org?: { orgId: string; role: string } | null;
        index?: typeof platformIndex;
        rigs?: typeof rigs;
      };
      if (!data.ok) return;
      if (data.org?.orgId) setOrgId(data.org.orgId);
      if (data.org?.role) setOrgRole(data.org.role);
      setRigs(data.rigs ?? []);
      setPlatformIndex(data.index ?? null);
    } catch {
      /* optional when auth not configured */
    }
  }, []);

  const refreshBuilds = useCallback(async () => {
    try {
      const params = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
      const res = await fetch(`/api/pp/builds${params}`);
      const data = (await res.json()) as {
        ok?: boolean;
        builds?: typeof builds;
      };
      if (data.ok && data.builds) setBuilds(data.builds);
    } catch {
      /* optional */
    }
  }, [orgId]);

  useEffect(() => {
    if (!isHosted) return;
    void refreshPlatformContext();
  }, [isHosted, refreshPlatformContext]);

  useEffect(() => {
    if (!isHosted || !orgId) return;
    void refreshBuilds();
    const id = window.setInterval(() => void refreshBuilds(), 8000);
    return () => window.clearInterval(id);
  }, [isHosted, orgId, refreshBuilds]);

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Could not read file."));
          return;
        }
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
  }

  async function queueBuild() {
    if (!commitPlan || !planId.trim()) return;
    if (unresolvedLibraryRows.length > 0) {
      setError(
        `Select a ProPresenter library variant for: ${unresolvedLibraryRows.map((r) => r.pcoTitle ?? r.name).join(", ")}`,
      );
      return;
    }
    setQueueBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pp/builds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: orgId ?? undefined,
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          commitPlan,
          librarySelections:
            Object.keys(librarySelections).length > 0 ? librarySelections : undefined,
          changeSummary: commitPlan.playlistName,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string; build?: { id: string } };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to queue build.");
      await refreshBuilds();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue build.");
    } finally {
      setQueueBusy(false);
    }
  }

  async function loadMockCommit() {
    setLoading(true);
    setError(null);
    setManifest(null);
    setCommitPlan(null);
    setApplyResult(null);
    setPublishResult(null);
    setLibrarySelections({});
    setPlaylistConflict(null);
    try {
      const res = await fetch("/api/slide-deck/mock-commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
        }),
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

  async function runApply(resolution?: "overwrite") {
    if (!planId.trim() || !commitPlan) return;

    setApplyLoading(true);
    setError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/slide-deck/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          confirm: true,
          resolution,
          commitPlan,
          librarySelections:
            Object.keys(librarySelections).length > 0 ? librarySelections : undefined,
        }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        conflict?: boolean;
        result?: {
          playlistId: string;
          playlistName: string;
          itemCount: number;
          items: { position: number; name: string }[];
          warnings: string[];
        };
        error?: string;
        playlistId?: string;
        playlistName?: string;
        itemCount?: number;
      };
      if (res.status === 409 && payload.conflict) {
        setPlaylistConflict({
          playlistId: payload.playlistId ?? "",
          playlistName: payload.playlistName ?? commitPlan.playlistName,
          itemCount: payload.itemCount ?? 0,
          items: [],
        });
        return;
      }
      if (!payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Apply failed.");
      }
      setPlaylistConflict(null);
      setShowConflictItems(false);
      setApplyResult(payload.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply to ProPresenter failed.");
    } finally {
      setApplyLoading(false);
    }
  }

  async function applyToProPresenter() {
    if (!planId.trim() || !commitPlan) return;
    if (unresolvedLibraryRows.length > 0) {
      setError(
        `Select a ProPresenter library variant for: ${unresolvedLibraryRows.map((r) => r.pcoTitle ?? r.name).join(", ")}`,
      );
      return;
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (commitPlan.playlistName) {
        params.set("playlistName", commitPlan.playlistName);
      } else {
        params.set("planId", planId.trim());
        if (serviceTypeId.trim()) params.set("serviceTypeId", serviceTypeId.trim());
      }
      const pre = await fetch(`/api/slide-deck/apply/preflight?${params}`);
      const prePayload = (await pre.json()) as {
        ok: boolean;
        conflict?: PlaylistConflictInfo | null;
        error?: string;
      };
      if (!prePayload.ok) {
        throw new Error(prePayload.error ?? "Preflight failed.");
      }
      if (prePayload.conflict) {
        setPlaylistConflict(prePayload.conflict);
        setShowConflictItems(false);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preflight failed.");
      return;
    }

    const ok = window.confirm(
      `Apply "${commitPlan.playlistName}" to ProPresenter?\n\nThis creates a new playlist and writes ${commitPlan.playlistPreview.length} preview rows. Requires PP_ALLOW_WRITES=true.`,
    );
    if (!ok) return;
    await runApply();
  }

  async function confirmOverwritePlaylist() {
    if (!playlistConflict || !commitPlan) return;
    const ok = window.confirm(
      `Replace the existing playlist "${playlistConflict.playlistName}" (${playlistConflict.itemCount} items) with the new commit preview?`,
    );
    if (!ok) return;
    await runApply("overwrite");
  }

  async function publishToDrive() {
    if (!planId.trim()) return;
    if (!googleConnected) {
      setError("Connect Google above (or on the hub), then try publish again.");
      return;
    }
    if (isHosted && !proplaylistFile) {
      setError("On the hosted site, upload a .proplaylist file first (see Option C below).");
      return;
    }

    const targetName = commitPlan?.playlistName ?? livePlaylistHint?.playlistName ?? "this service";
    const liveNote = isHosted
      ? `\n\nWill upload "${proplaylistFile?.name}" to Drive (no ProPresenter export on server).`
      : livePlaylistHint
        ? `\n\nWill export "${livePlaylistHint.playlistName}" (${livePlaylistHint.itemCount} items) from ProPresenter, then upload to Drive.`
        : applyResult
          ? `\n\nWill export "${applyResult.playlistName}" from ProPresenter (File → Export → Playlist), then upload.`
          : "\n\nNo live playlist detected — publish needs an existing or applied ProPresenter playlist on this Mac.";

    const ok = window.confirm(
      `Publish "${targetName}" to Google Drive?${liveNote}\n\n` +
        (isHosted
          ? "Uploads a transport .zip plus the .proplaylist to Playlists/{service}/."
          : "Keep ProPresenter open and frontmost during publish. Uploads a transport .zip plus the .proplaylist to Playlists/{service}/."),
    );
    if (!ok) return;

    setPublishLoading(true);
    setError(null);
    try {
      let proplaylistBase64: string | undefined;
      let proplaylistFileName: string | undefined;
      if (proplaylistFile) {
        proplaylistBase64 = await fileToBase64(proplaylistFile);
        proplaylistFileName = proplaylistFile.name;
      }

      const res = await fetch("/api/slide-deck/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          confirm: true,
          applyResult: applyResult ?? undefined,
          proplaylistBase64,
          proplaylistFileName,
        }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        result?: {
          serviceFolderKey: string;
          packageId: string;
          driveFolderUrl: string;
          files: unknown[];
          newFiles: unknown[];
        };
        error?: string;
      };
      if (!payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Publish failed.");
      }
      setPublishResult({
        serviceFolderKey: payload.result.serviceFolderKey,
        packageId: payload.result.packageId,
        driveFolderUrl: payload.result.driveFolderUrl,
        fileCount: payload.result.files.length,
        newFileCount: payload.result.newFiles.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish to Drive failed.");
    } finally {
      setPublishLoading(false);
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
        <strong>Preview first.</strong> Build commit preview, then <strong>Send to presentation rig</strong>,
        then <strong>Publish to Drive</strong> for the church rig. See{" "}
        <code className="font-mono text-xs">docs/PROPRESENTER-PUBLISH.md</code> and{" "}
        <code className="font-mono text-xs">docs/HOSTING-GRAPEVINE.md</code>.
      </div>

      {isHosted ? (
        <SlideDeckHostedPanel
          planId={planId}
          serviceTypeId={serviceTypeId}
          manifest={manifest}
          commitPlan={commitPlan}
          librarySelections={librarySelections}
          indexMeta={platformIndex}
          builds={builds}
          rigs={rigs}
          orgId={orgId}
          isAdmin={orgRole === "admin"}
          queueBusy={queueBusy}
          onQueueBuild={() => void queueBuild()}
          onRefreshBuilds={() => void refreshBuilds()}
          onRigsChange={() => void refreshPlatformContext()}
          onSelectLibrary={(position, itemId) =>
            setLibrarySelections((prev) => ({ ...prev, [String(position)]: itemId }))
          }
          proplaylistFile={proplaylistFile}
          onProplaylistFileChange={setProplaylistFile}
        />
      ) : null}

      <GoogleConnectionCard compact hint="Required to publish handoff packages to Drive." />

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">ProPresenter</h2>
          {ppStatus ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                ppStatus.connected
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : ppStatus.hosted
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                    : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {ppStatus.connected
                ? "Connected"
                : ppStatus.hosted
                  ? "Local Mac only"
                  : "Not connected"}
            </span>
          ) : (
            <span className="text-xs text-zinc-500">Checking…</span>
          )}
        </div>
        {ppStatus && !ppStatus.connected && ppStatus.error ? (
          <p
            className={`text-xs ${
              ppStatus.hosted
                ? "rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {ppStatus.error}
          </p>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {step === "Setup" ? (
        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
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
            serviceTypeLabel={
              planScope ? `Plan type — ${planScope.name}` : "Plan type (advanced)"
            }
            serviceTypeHint="Change only if you need a different scoped service type."
          />
          <button
            type="button"
            disabled={loading || plansBusy || !planId.trim()}
            onClick={() => void loadMockCommit()}
            className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Building preview…" : "Preview mock commit"}
          </button>
          {livePlaylistHint ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Live playlist detected: <span className="font-mono">{livePlaylistHint.playlistName}</span> (
              {livePlaylistHint.itemCount} items) — you can publish without applying in this session.
            </p>
          ) : null}
          <button
            type="button"
            disabled={publishDisabled}
            onClick={() => void publishToDrive()}
            className="h-11 rounded-xl border border-sky-700 px-4 text-sm font-medium text-sky-800 disabled:opacity-50 dark:border-sky-500 dark:text-sky-200"
          >
            {publishLoading ? "Publishing to Drive…" : "Publish to Drive"}
          </button>
          {isHosted && !canPublishOnHosted ? (
            <p className="text-xs text-sky-800 dark:text-sky-200">
              Upload a .proplaylist in the hosted panel to enable Drive publish.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "Commit preview" && commitPlan && manifest ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Mock commit summary</h2>
              <div className="flex flex-wrap gap-2">
                {commitPlan.playlistConflict ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-200">
                    Playlist name conflict
                  </span>
                ) : null}
                {livePlaylistHint ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    Live playlist detected
                  </span>
                ) : null}
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Writes blocked
                </span>
              </div>
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
              {unresolvedLibraryRows.length > 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Select a library variant for {unresolvedLibraryRows.length} song(s) in the playlist
                  preview before applying.
                </p>
              ) : null}
              <button
                type="button"
                disabled={
                  isHosted ||
                  applyLoading ||
                  Boolean(applyResult) ||
                  unresolvedLibraryRows.length > 0 ||
                  !canLocalApply
                }
                onClick={() => void applyToProPresenter()}
                className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-600"
              >
                {applyLoading
                  ? "Applying to ProPresenter…"
                  : applyResult
                    ? "Applied"
                    : isHosted
                      ? "Apply (Mac only)"
                      : "Apply to ProPresenter"}
              </button>
              <button
                type="button"
                disabled={publishDisabled}
                onClick={() => void publishToDrive()}
                className="h-11 rounded-xl bg-sky-700 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-sky-600"
              >
                {publishLoading
                  ? "Publishing to Drive…"
                  : publishResult
                    ? "Published"
                    : "Publish to Drive"}
              </button>
              <button
                type="button"
                onClick={() => setStep("Setup")}
                className="h-11 rounded-xl border px-4 text-sm dark:border-zinc-700"
              >
                ← Change plan
              </button>
            </div>
            {isHosted ? (
              <p className="text-xs text-sky-800 dark:text-sky-200">
                Apply and ProPresenter export are disabled on the hosted site — use the Mac agent or
                CLI above.
              </p>
            ) : ppStatus && !ppStatus.allowWrites ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Set <code className="font-mono">PP_ALLOW_WRITES=true</code> in .env.local and restart
                the dev server to enable live apply.
              </p>
            ) : null}

            {playlistConflict ? (
              <section className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-100">
                  Existing ProPresenter playlist
                </h3>
                <p className="text-sm text-red-800 dark:text-red-200">
                  A playlist named <strong className="font-mono">{playlistConflict.playlistName}</strong>{" "}
                  already exists with {playlistConflict.itemCount} item(s). Choose Overwrite to replace
                  it, View to inspect, or Cancel to keep ProPresenter unchanged.
                </p>
                {showConflictItems && playlistConflict.items.length > 0 ? (
                  <ol className="max-h-48 list-decimal overflow-y-auto space-y-1 pl-5 text-sm text-red-900 dark:text-red-100">
                    {playlistConflict.items.map((item) => (
                      <li key={item.position}>{item.name}</li>
                    ))}
                  </ol>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-lg bg-red-800 px-3 text-sm font-medium text-white dark:bg-red-700"
                    disabled={applyLoading}
                    onClick={() => void confirmOverwritePlaylist()}
                  >
                    Overwrite
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-lg border border-red-300 px-3 text-sm dark:border-red-800"
                    onClick={async () => {
                      if (playlistConflict.items.length > 0) {
                        setShowConflictItems(true);
                        return;
                      }
                      const params = new URLSearchParams({ planId: planId.trim() });
                      if (serviceTypeId.trim()) params.set("serviceTypeId", serviceTypeId.trim());
                      const pre = await fetch(`/api/slide-deck/apply/preflight?${params}`);
                      const data = (await pre.json()) as {
                        conflict?: PlaylistConflictInfo | null;
                      };
                      if (data.conflict) {
                        setPlaylistConflict(data.conflict);
                        setShowConflictItems(true);
                      }
                    }}
                  >
                    View current plan
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-lg border border-red-300 px-3 text-sm dark:border-red-800"
                    onClick={() => {
                      setPlaylistConflict(null);
                      setShowConflictItems(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            ) : null}
          </section>

          {publishResult ? (
            <section className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950">
              <h2 className="text-lg font-medium text-sky-900 dark:text-sky-100">
                Published to Drive
              </h2>
              <p className="text-sm text-sky-800 dark:text-sky-200">
                Folder <strong className="font-mono">{publishResult.serviceFolderKey}</strong> —{" "}
                {publishResult.fileCount} file(s) in Playlists
                {publishResult.newFileCount > 0
                  ? `, ${publishResult.newFileCount} in New Files`
                  : ""}
                .
              </p>
              <a
                href={publishResult.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-sky-700 underline dark:text-sky-300"
              >
                Open package on Google Drive
              </a>
              <p className="font-mono text-xs text-sky-700 dark:text-sky-400">
                {publishResult.packageId}
              </p>
            </section>
          ) : null}

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

          <PlaylistPreview
            rows={commitPlan.playlistPreview}
            librarySelections={librarySelections}
            onSelectLibrary={(position, itemId) =>
              setLibrarySelections((prev) => ({ ...prev, [String(position)]: itemId }))
            }
          />

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

function PlaylistPreview({
  rows,
  librarySelections,
  onSelectLibrary,
}: {
  rows: MockCommitPlaylistRow[];
  librarySelections: Record<string, string>;
  onSelectLibrary: (position: number, itemId: string) => void;
}) {
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
      </div>
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
