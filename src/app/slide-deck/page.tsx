"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleConnectionCard } from "@/components/google-connection-card";
import { SlideDeckBuilderEditor } from "@/components/slide-deck-builder-editor";
import { SlideDeckHandoffDiscovery } from "@/components/slide-deck-handoff-discovery";
import { SlideDeckHostedPanel } from "@/components/slide-deck-hosted-panel";
import { PrepDownloadLinks } from "@/components/prep-download-links";
import { SlideDeckUploadTool } from "@/components/slide-deck-upload-tool";
import { ToolShell } from "@/components/tool-shell";
import { missingSongRows, unresolvedAmbiguousRows } from "@/components/slide-deck-library-match";
import { usePcoServicePlanSelection } from "@/hooks/use-pco-service-plan-selection";
import { downloadBlob } from "@/lib/download-blob";
import type { FilebasePullManifest } from "@/lib/google/filebase-pull";
import { formatApiErrorBody, readJsonOrText } from "@/lib/http/read-json-or-text";
import { looksLikeBinaryPayload, sanitizeErrorMessage } from "@/lib/http/sanitize-error-message";
import type { ImplementationPlan } from "@/lib/slide-deck/implementation-plan";
import type { MockCommitPlan } from "@/lib/slide-deck/mock-commit";
import {
  comparePlaylistToExpected,
  expectedNamesFromCommitPlan,
} from "@/lib/slide-deck/playlist-match";
import type { MergeConflict } from "@/lib/slide-deck/plan-merge";
import {
  evaluateCreatePresentationReadiness,
  type CreatePresentationIssue,
} from "@/lib/slide-deck/commit-guards";
import {
  missingElementsFromCommitPlan,
} from "@/lib/slide-deck/handoff";
import { buildByoCommitPlan } from "@/lib/slide-deck/byo-commit-plan";
import { buildPlaylistNameFromPlanDate } from "@/lib/slide-deck/playlist-name";
import type { SlideDeckHandoffSummary, UploadScanPayload, MissingFileRef } from "@/lib/slide-deck/page-types";
import {
  canWebSlideDeckApply,
  canWebUploadScan,
  derivePpStatusLabel,
  deriveSlideDeckDeviceMode,
  UPLOAD_COMPLETE_HANDOFF_MESSAGE,
  type SlideDeckDeviceMode,
} from "@/lib/slide-deck/device-context";
import type { SlideDeckManifest } from "@/lib/slide-deck/types";

type PpStatus = {
  connected: boolean;
  hosted?: boolean;
  error?: string;
  allowWrites?: boolean;
  devApplyEnabled?: boolean;
  deviceMode?: SlideDeckDeviceMode;
};

type PlaylistConflictInfo = {
  playlistId: string;
  playlistName: string;
  itemCount: number;
  items: { position: number; name: string }[];
};

export default function SlideDeckPage() {
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
  const [createIssues, setCreateIssues] = useState<CreatePresentationIssue[]>([]);
  const [previewReady, setPreviewReady] = useState(false);
  const [presentationInstanceId, setPresentationInstanceId] = useState<string | null>(null);
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
  const [playlistConflict, setPlaylistConflict] = useState<PlaylistConflictInfo | null>(null);
  const [showConflictItems, setShowConflictItems] = useState(false);
  const [librarySelections, setLibrarySelections] = useState<Record<string, string>>({});
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
    Array<{ id: string; displayName: string; rigKind?: string; lastSeenAt: string | null }>
  >([]);
  const [builds, setBuilds] = useState<
    Array<{
      id: string;
      status: string;
      error_message?: string | null;
      change_summary?: string | null;
      created_at?: string;
      completed_at?: string | null;
      rig_id?: string | null;
      plan_id?: string;
      service_type_id?: string | null;
      commit_plan?: MockCommitPlan;
      result?: { publish?: { driveFolderUrl?: string } } | null;
    }>
  >([]);
  const [queueBusy, setQueueBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submissions, setSubmissions] = useState<
    Array<{
      id: string;
      created_by: string;
      created_at: string;
      change_summary: string | null;
      status: string;
      commit_plan?: MockCommitPlan;
      manifest?: SlideDeckManifest | null;
      library_selections?: Record<string, string>;
    }>
  >([]);
  const [handoffs, setHandoffs] = useState<SlideDeckHandoffSummary[]>([]);
  const [handoffAuthors, setHandoffAuthors] = useState<Record<string, { displayName: string; email: string | null }>>({});
  const [selectedHandoffId, setSelectedHandoffId] = useState<string | null>(null);
  const [parentHandoffId, setParentHandoffId] = useState<string | null>(null);
  const [mergeReview, setMergeReview] = useState<{
    conflicts: MergeConflict[];
    implementationPlan: ImplementationPlan;
    rowSourceOverrides: Record<string, string>;
  } | null>(null);
  const [uploadScan, setUploadScan] = useState<UploadScanPayload | null>(null);
  const [uploadPlaylistId, setUploadPlaylistId] = useState("");
  const [uploadDiffs, setUploadDiffs] = useState<string[] | null>(null);
  const [uploadDiffMatched, setUploadDiffMatched] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadToolOpen, setUploadToolOpen] = useState(false);
  const [byoUploadMode, setByoUploadMode] = useState(false);
  const [replaceOnRig, setReplaceOnRig] = useState(false);
  const [adminApproveForRig, setAdminApproveForRig] = useState(false);
  const [filebasePullBusy, setFilebasePullBusy] = useState(false);
  const [filebasePullMessage, setFilebasePullMessage] = useState<string | null>(null);
  const [filebasePullError, setFilebasePullError] = useState<string | null>(null);
  const [missingFiles, setMissingFiles] = useState<MissingFileRef[]>([]);
  const [pendingRigHandoffs, setPendingRigHandoffs] = useState<
    Array<{ id: string; playlist_name: string; services_drive_url: string | null }>
  >([]);

  const isHosted = Boolean(ppStatus?.hosted);
  const deviceMode =
    ppStatus?.deviceMode ??
    deriveSlideDeckDeviceMode({
      hosted: ppStatus?.hosted,
      localPpConnected: ppStatus?.connected,
      devApplyEnabled: ppStatus?.devApplyEnabled,
    });
  const ppStatusLabel = derivePpStatusLabel({
    hosted: ppStatus?.hosted,
    connected: ppStatus?.connected,
    devApplyEnabled: ppStatus?.devApplyEnabled,
  });
  const canLocalApply = Boolean(
    canWebSlideDeckApply(deviceMode) && ppStatus?.connected && ppStatus?.allowWrites,
  );
  const isAdmin = orgRole === "admin";
  const showUploadTool =
    canWebUploadScan(deviceMode) &&
    uploadToolOpen &&
    ((previewReady && Boolean(applyResult) && Boolean(commitPlan)) ||
      (byoUploadMode && Boolean(planId.trim())));
  const uploadDisplayPlaylistName =
    commitPlan?.playlistName ??
    uploadScan?.expectedPlaylistName ??
    (selectedPlan?.sortDate ? buildPlaylistNameFromPlanDate(selectedPlan.sortDate) : "");

  const missingLibraryRows = useMemo(() => missingSongRows(commitPlan), [commitPlan]);
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
        devApplyEnabled: data.devApplyEnabled,
        deviceMode: data.deviceMode,
      });
    } catch {
      setPpStatus({ connected: false, error: "Could not reach ProPresenter status endpoint." });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshPpStatus());
  }, [refreshPpStatus]);

  const refreshPendingRigHandoffs = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/pp/handoffs/pending-rig?orgId=${encodeURIComponent(orgId)}`);
      const data = (await res.json()) as {
        ok?: boolean;
        handoffs?: Array<{ id: string; playlist_name: string; services_drive_url: string | null }>;
      };
      if (data.ok && data.handoffs) setPendingRigHandoffs(data.handoffs);
    } catch {
      /* optional */
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    queueMicrotask(() => void refreshPendingRigHandoffs());
    const id = window.setInterval(() => void refreshPendingRigHandoffs(), 12000);
    return () => window.clearInterval(id);
  }, [orgId, refreshPendingRigHandoffs]);

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
      /* optional */
    }
  }, []);

  const refreshBuilds = useCallback(async () => {
    try {
      const params = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
      const res = await fetch(`/api/pp/builds${params}`);
      const data = (await res.json()) as { ok?: boolean; builds?: typeof builds };
      if (data.ok && data.builds) setBuilds(data.builds);
    } catch {
      /* optional */
    }
  }, [orgId]);

  const refreshHandoffs = useCallback(async () => {
    if (!orgId || !planId.trim()) return;
    try {
      const params = new URLSearchParams({
        orgId,
        planId: planId.trim(),
        handoffsOnly: "1",
      });
      if (serviceTypeId.trim()) params.set("serviceTypeId", serviceTypeId.trim());
      const res = await fetch(`/api/pp/submissions?${params}`);
      const data = (await res.json()) as {
        ok?: boolean;
        handoffs?: SlideDeckHandoffSummary[];
        authors?: Record<string, { displayName: string; email: string | null }>;
      };
      if (data.ok && data.handoffs) {
        setHandoffs(data.handoffs);
        if (data.authors) setHandoffAuthors(data.authors);
        if (!selectedHandoffId && data.handoffs[0]) {
          setSelectedHandoffId(data.handoffs[0].id);
        }
      }
    } catch {
      /* optional */
    }
  }, [orgId, planId, serviceTypeId, selectedHandoffId]);

  const refreshSubmissions = useCallback(async () => {
    if (!orgId || !planId.trim() || !commitPlan?.playlistName) return;
    try {
      const params = new URLSearchParams({
        orgId,
        planId: planId.trim(),
        playlistName: commitPlan.playlistName,
      });
      if (serviceTypeId.trim()) params.set("serviceTypeId", serviceTypeId.trim());
      const res = await fetch(`/api/pp/submissions?${params}`);
      const data = (await res.json()) as { ok?: boolean; submissions?: typeof submissions };
      if (data.ok && data.submissions) setSubmissions(data.submissions);
    } catch {
      /* optional */
    }
  }, [orgId, planId, serviceTypeId, commitPlan]);

  useEffect(() => {
    queueMicrotask(() => void refreshPlatformContext());
  }, [refreshPlatformContext]);

  useEffect(() => {
    if (!orgId) return;
    queueMicrotask(() => void refreshBuilds());
    const id = window.setInterval(() => void refreshBuilds(), 8000);
    return () => window.clearInterval(id);
  }, [orgId, refreshBuilds]);

  useEffect(() => {
    if (orgId && planId.trim()) queueMicrotask(() => void refreshHandoffs());
  }, [orgId, planId, serviceTypeId, refreshHandoffs]);

  useEffect(() => {
    if (!orgId || !commitPlan?.playlistName) return;
    queueMicrotask(() => void refreshSubmissions());
  }, [orgId, commitPlan?.playlistName, refreshSubmissions]);

  useEffect(() => {
    if (!previewReady || !commitPlan) return;
    const readiness = evaluateCreatePresentationReadiness(
      commitPlan,
      manifest,
      librarySelections,
    );
    setCreateIssues(readiness.issues);
    if (readiness.ready) setError(null);
  }, [previewReady, commitPlan, manifest, librarySelections]);

  function resetPreviewState() {
    setPreviewReady(false);
    setManifest(null);
    setCommitPlan(null);
    setApplyResult(null);
    setLibrarySelections({});
    setPlaylistConflict(null);
    setPresentationInstanceId(null);
    setParentHandoffId(null);
    setCreateIssues([]);
    setUploadScan(null);
    setUploadDiffs(null);
    setMissingFiles([]);
    setUploadToolOpen(false);
    setByoUploadMode(false);
    setReplaceOnRig(false);
    setAdminApproveForRig(false);
  }

  async function createPresentation() {
    setLoading(true);
    setError(null);
    setCreateIssues([]);
    resetPreviewState();
    const freshId = crypto.randomUUID();
    try {
      const res = await fetch("/api/slide-deck/mock-commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          orgId: orgId ?? undefined,
        }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        manifest?: SlideDeckManifest;
        commitPlan?: MockCommitPlan;
        error?: string;
      };
      if (!payload.ok || !payload.manifest || !payload.commitPlan) {
        throw new Error(payload.error ?? "Create presentation failed.");
      }

      setManifest(payload.manifest);
      setCommitPlan(payload.commitPlan);
      setPresentationInstanceId(freshId);
      setPreviewReady(true);

      const readiness = evaluateCreatePresentationReadiness(
        payload.commitPlan,
        payload.manifest,
        {},
      );
      setCreateIssues(readiness.issues);
      // Keep preview visible so library variant pickers render; block Send/Download via createIssues.
      setError(null);
      void refreshPpStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create presentation.");
    } finally {
      setLoading(false);
    }
  }

  function loadHandoffIntoBuilder(handoff: SlideDeckHandoffSummary, forDownloadOnly = false) {
    setSelectedHandoffId(handoff.id);
    if (!forDownloadOnly) {
      setParentHandoffId(handoff.id);
    }
    setManifest(handoff.manifest ?? null);
    setCommitPlan(handoff.commit_plan ?? null);
    setLibrarySelections(handoff.library_selections ?? {});
    setPresentationInstanceId(handoff.presentation_instance_id);
    setPreviewReady(true);
    setCreateIssues([]);
    setError(null);
  }

  async function submitDraft() {
    if (!commitPlan || !planId.trim()) return;
    if (missingLibraryRows.length > 0 || unresolvedLibraryRows.length > 0) {
      setError("Resolve library matches before submitting a merge draft.");
      return;
    }
    setSubmitBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pp/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: orgId ?? undefined,
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          playlistName: commitPlan.playlistName,
          commitPlan,
          manifest: manifest ?? undefined,
          librarySelections:
            Object.keys(librarySelections).length > 0 ? librarySelections : undefined,
          changeSummary: commitPlan.playlistName,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to submit draft.");
      await refreshSubmissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit draft.");
    } finally {
      setSubmitBusy(false);
    }
  }

  async function queueBuildWithOverrides(
    rowSourceOverrides?: Record<string, string>,
    implementationPlan?: ImplementationPlan,
  ) {
    if (!commitPlan || !planId.trim()) return;
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
          baselineCommitPlan: commitPlan,
          librarySelections:
            Object.keys(librarySelections).length > 0 ? librarySelections : undefined,
          changeSummary: commitPlan.playlistName,
          rowSourceOverrides,
          implementationPlan,
        }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        error?: string;
        needsReview?: boolean;
        conflicts?: MergeConflict[];
        implementationPlan?: ImplementationPlan;
      };
      if (res.status === 409 && payload.needsReview && payload.conflicts && payload.implementationPlan) {
        const overrides: Record<string, string> = {};
        for (const row of payload.implementationPlan.rows) {
          if (row.hadConflict) overrides[row.elementKey] = row.sourceSubmissionId;
        }
        setMergeReview({
          conflicts: payload.conflicts,
          implementationPlan: payload.implementationPlan,
          rowSourceOverrides: overrides,
        });
        return;
      }
      if (!payload.ok) throw new Error(payload.error ?? "Failed to queue build.");
      setMergeReview(null);
      await refreshBuilds();
      await refreshSubmissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue build.");
    } finally {
      setQueueBusy(false);
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
        result?: typeof applyResult;
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
      if (!payload.ok || !payload.result) throw new Error(payload.error ?? "Apply failed.");
      setPlaylistConflict(null);
      setApplyResult(payload.result);
      setUploadToolOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download to ProPresenter failed.");
    } finally {
      setApplyLoading(false);
    }
  }

  async function downloadPresentation() {
    if (!commitPlan) return;
    const ok = window.confirm(
      `Download "${commitPlan.playlistName}" onto this ProPresenter device?`,
    );
    if (!ok) return;
    await runApply();
  }

  async function scanUploadPlaylist(playlistId?: string) {
    if (!planId.trim()) return;
    if (!byoUploadMode && !commitPlan) return;
    setUploadBusy(true);
    try {
      const res = await fetch("/api/slide-deck/upload/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          playlistId: playlistId?.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as UploadScanPayload & { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Scan failed.");
      setUploadScan({
        expectedPlaylistName: payload.expectedPlaylistName ?? commitPlan?.playlistName ?? "",
        expectedByName: payload.expectedByName ?? null,
        selected: payload.selected ?? null,
        playlists: payload.playlists ?? [],
      });
      setUploadPlaylistId(payload.selected?.playlistId ?? "");

      const mfRes = await fetch("/api/slide-deck/upload/missing-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          orgId: orgId ?? undefined,
          playlistId: payload.selected?.playlistId ?? playlistId,
        }),
      });
      const mfData = (await mfRes.json()) as { ok?: boolean; missingFiles?: MissingFileRef[] };
      if (mfData.ok) setMissingFiles(mfData.missingFiles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload scan failed.");
    } finally {
      setUploadBusy(false);
    }
  }

  function openByoUpload() {
    setByoUploadMode(true);
    setUploadToolOpen(true);
    setError(null);
    void scanUploadPlaylist();
  }

  async function saveHandoff(tag: "complete" | "incomplete") {
    if (!uploadScan?.selected) return;

    const activeCommitPlan =
      commitPlan ??
      (byoUploadMode
        ? buildByoCommitPlan({
            planId: planId.trim(),
            serviceDateRaw: selectedPlan?.sortDate ?? null,
            playlistName: uploadScan.selected.playlistName,
            items: uploadScan.selected.items,
          })
        : null);

    if (!activeCommitPlan) return;

    const expectedItems = expectedNamesFromCommitPlan(activeCommitPlan);
    const actualItems = uploadScan.selected.items.map((it) => ({
      id: "",
      name: it.name,
      index: it.position,
    }));
    const diff = comparePlaylistToExpected(expectedItems, actualItems as never);
    if (tag === "complete" && !byoUploadMode && !diff.matched) {
      setError("Cannot upload as complete: playlist differs from expected.");
      return;
    }

    const missingElements = byoUploadMode
      ? diff.differences.map((d) => ({ kind: "playlist_diff" as const, label: d }))
      : missingElementsFromCommitPlan(commitPlan!, librarySelections, diff.differences);

    setUploadBusy(true);
    try {
      let proplaylistBase64: string | undefined;
      let proplaylistFileName: string | undefined;
      if (tag === "complete" || tag === "incomplete") {
        const exportRes = await fetch("/api/slide-deck/upload/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            planId: planId.trim(),
            serviceTypeId: serviceTypeId.trim() || undefined,
            playlistId: uploadScan.selected.playlistId,
            playlistName: activeCommitPlan.playlistName,
          }),
        });
        const exportPayload = (await exportRes.json()) as {
          ok?: boolean;
          proplaylistBase64?: string;
          fileName?: string;
          error?: string;
        };
        if (!exportPayload.ok || !exportPayload.proplaylistBase64) {
          throw new Error(
            exportPayload.error ??
              "Could not export .proplaylist — export manually in ProPresenter first.",
          );
        }
        proplaylistBase64 = exportPayload.proplaylistBase64;
        proplaylistFileName = exportPayload.fileName;
      }

      const lineageParent =
        parentHandoffId ?? selectedHandoffId ?? undefined;

      const res = await fetch("/api/pp/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: orgId ?? undefined,
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
          playlistName: activeCommitPlan.playlistName,
          commitPlan: activeCommitPlan,
          manifest: manifest ?? undefined,
          librarySelections,
          handoffStatus: tag,
          missingElements,
          missingFiles,
          parentHandoffId: lineageParent,
          presentationInstanceId: presentationInstanceId ?? undefined,
          proplaylistBase64,
          proplaylistFileName,
          uploadSource: byoUploadMode ? "byo" : "grapevine",
          replaceOnRig,
          adminApprovedForRig: tag === "complete" && isAdmin && adminApproveForRig,
          playlistItems: byoUploadMode ? uploadScan.selected.items : undefined,
          changeSummary:
            tag === "complete"
              ? "Complete upload"
              : `Incomplete — ${diff.differences.slice(0, 3).join("; ")}`,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string; servicesHandoff?: { message?: string } };
      if (!payload.ok) throw new Error(payload.error ?? "Upload failed.");
      await refreshHandoffs();
      setUploadToolOpen(false);
      setByoUploadMode(false);
      if (tag === "complete" && isAdmin && adminApproveForRig) {
        window.alert(UPLOAD_COMPLETE_HANDOFF_MESSAGE);
      } else if (tag === "complete") {
        window.alert(
          "Complete upload saved. An admin must sign off before the presentation rig auto-imports.",
        );
      }
      else if (payload.servicesHandoff?.message) {
        /* queued for Services/ when layout configured */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function pullFilebaseZip() {
    if (!planId.trim() || !orgId) return;
    setFilebasePullBusy(true);
    setFilebasePullError(null);
    setFilebasePullMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/filebase/pull", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          orgId,
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
        }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && contentType.includes("application/zip")) {
        const blob = await res.blob();
        downloadBlob(blob, `filebase-pull-${planId.trim()}.zip`);
        setFilebasePullMessage("Download started.");
        return;
      }
      const parsed = await readJsonOrText(res);
      if (!res.ok) {
        throw new Error(sanitizeErrorMessage(formatApiErrorBody(res.status, parsed)));
      }
      if (parsed.kind !== "json") {
        throw new Error(
          looksLikeBinaryPayload(parsed.text)
            ? "Filebase pull returned a zip file but the browser could not download it. Hard-refresh and try again."
            : "Filebase pull returned an unexpected response. Hard-refresh and try again.",
        );
      }
      const payload = parsed.json as {
        ok?: boolean;
        error?: string;
        downloadUrl?: string;
        fileName?: string;
        manifest?: FilebasePullManifest;
      };
      if (!payload.ok) {
        throw new Error(sanitizeErrorMessage(payload.error ?? "Filebase pull failed."));
      }

      const pullManifest = payload.manifest ?? null;
      const outFileName = payload.fileName ?? `filebase-pull-${planId.trim()}.zip`;

      if (!payload.downloadUrl?.trim()) {
        throw new Error("Filebase pull returned no download link.");
      }

      const dl = await fetch(payload.downloadUrl, { credentials: "same-origin" });
      if (!dl.ok) {
        const dlParsed = await readJsonOrText(dl);
        throw new Error(sanitizeErrorMessage(formatApiErrorBody(dl.status, dlParsed)));
      }
      const blob = await dl.blob();
      downloadBlob(blob, outFileName);

      const count = pullManifest?.fileCount ?? 0;
      const name = pullManifest?.playlistName ?? "presentation";
      setFilebasePullMessage(
        count > 0
          ? `Downloaded ${count} file${count === 1 ? "" : "s"} for ${name}. Unzip into your ProPresenter library folder.`
          : "Download started.",
      );
    } catch (e) {
      const message = sanitizeErrorMessage(
        e instanceof Error ? e.message : "Filebase pull failed.",
      );
      setFilebasePullError(message);
      setError(message);
    } finally {
      setFilebasePullBusy(false);
    }
  }

  useEffect(() => {
    if (!showUploadTool || !commitPlan || !ppStatus?.connected) return;
    queueMicrotask(() => void scanUploadPlaylist());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUploadTool, commitPlan?.playlistName, ppStatus?.connected]);

  useEffect(() => {
    if (!commitPlan || !uploadScan?.selected) {
      queueMicrotask(() => {
        setUploadDiffs(null);
        setUploadDiffMatched(false);
      });
      return;
    }
    const diff = comparePlaylistToExpected(
      expectedNamesFromCommitPlan(commitPlan),
      uploadScan.selected.items.map((it) => ({ id: "", name: it.name, index: it.position })) as never,
    );
    queueMicrotask(() => {
      setUploadDiffs(diff.differences);
      setUploadDiffMatched(diff.matched);
    });
  }, [commitPlan, uploadScan?.selected]);

  async function approveHandoffForRig(handoffId: string) {
    if (!orgId || !isAdmin) return;
    setError(null);
    try {
      const res = await fetch(`/api/pp/handoffs/${handoffId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Approve failed.");
      await refreshHandoffs();
      await refreshPendingRigHandoffs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed.");
    }
  }

  const weekendLabel = selectedPlan?.label ?? planId;

  return (
    <ToolShell toolId="slide-deck">
      {isHosted ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
            <p>
              Browser planner mode — preview, handoffs, and <strong>Send to presentation rig</strong>{" "}
              work here. Download and upload need the Grapevine Prep desktop app on a laptop with
              ProPresenter.
            </p>
          </div>
          <PrepDownloadLinks compact />
        </div>
      ) : deviceMode === "local_prep" || deviceMode === "dev_local" ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
          <strong>Grapevine Prep</strong> — continue Download and Upload here. Use the same weekend
          you chose on grapevineprep.com, then Create Presentation again before downloading.
        </div>
      ) : null}

      {isHosted ? (
        <SlideDeckHostedPanel
          planId={planId}
          serviceTypeId={serviceTypeId}
          manifest={manifest}
          commitPlan={commitPlan}
          librarySelections={librarySelections}
          indexMeta={platformIndex}
          builds={builds}
          submissions={submissions}
          rigs={rigs}
          orgId={orgId}
          isAdmin={orgRole === "admin"}
          queueBusy={queueBusy}
          submitBusy={submitBusy}
          mergeReview={mergeReview}
          onQueueBuild={() => void queueBuildWithOverrides()}
          onSubmitDraft={() => void submitDraft()}
          onRefreshBuilds={() => void refreshBuilds()}
          onRefreshSubmissions={() => void refreshSubmissions()}
          onRigsChange={() => void refreshPlatformContext()}
          onSelectLibrary={(position, itemId) =>
            setLibrarySelections((prev) => ({ ...prev, [String(position)]: itemId }))
          }
          onMergeSourceChange={(elementKey, submissionId) =>
            setMergeReview((prev) =>
              prev
                ? {
                    ...prev,
                    rowSourceOverrides: { ...prev.rowSourceOverrides, [elementKey]: submissionId },
                  }
                : prev,
            )
          }
          onConfirmMergeSend={() => {
            if (!mergeReview) return;
            void queueBuildWithOverrides(mergeReview.rowSourceOverrides);
          }}
          onCancelMergeReview={() => setMergeReview(null)}
          proplaylistFile={proplaylistFile}
          onProplaylistFileChange={setProplaylistFile}
          pendingRigHandoffs={pendingRigHandoffs}
        />
      ) : null}

      <GoogleConnectionCard compact hint="Required for Services/ package publish when enabled." />

      <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Device</h2>
          {ppStatus ? (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">
              {ppStatusLabel.label}
            </span>
          ) : null}
        </div>
        {ppStatus?.error ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{ppStatus.error}</p>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {planId.trim() && orgId ? (
        <SlideDeckHandoffDiscovery
          handoffs={handoffs}
          authors={handoffAuthors}
          selectedHandoffId={selectedHandoffId}
          planLabel={weekendLabel}
          isAdmin={isAdmin}
          onApproveForRig={(id) => void approveHandoffForRig(id)}
          onSelectHandoff={(h) => setSelectedHandoffId(h.id)}
          onBuildFresh={() => {
            resetPreviewState();
            setError(null);
          }}
          onDownloadExisting={(h) => {
            loadHandoffIntoBuilder(h, true);
            if (canLocalApply) void downloadPresentation();
            else setError("Download existing requires local ProPresenter on a prep machine.");
          }}
        />
      ) : null}

      <SlideDeckBuilderEditor
        planId={planId}
        serviceTypeId={serviceTypeId}
        setServiceTypeId={setServiceTypeId}
        upcomingPlans={upcomingPlans}
        serviceTypeOptions={serviceTypeOptions}
        planScope={planScope}
        selectedPlan={selectedPlan}
        plansBusy={plansBusy}
        plansError={plansError}
        selectPlan={selectPlan}
        loadOptions={loadOptions}
        loading={loading}
        createIssues={createIssues}
        previewReady={previewReady}
        manifest={manifest}
        commitPlan={commitPlan}
        presentationInstanceId={presentationInstanceId}
        librarySelections={librarySelections}
        onSelectLibrary={(position, itemId) =>
          setLibrarySelections((prev) => ({ ...prev, [String(position)]: itemId }))
        }
        onCreatePresentation={() => void createPresentation()}
        onChangeWeekend={() => resetPreviewState()}
        isHosted={isHosted}
        deviceMode={deviceMode}
        canLocalApply={canLocalApply}
        applyLoading={applyLoading}
        applyResult={applyResult}
        onDownloadPresentation={() => void downloadPresentation()}
        onOpenUploadTool={() => {
          setByoUploadMode(false);
          setUploadToolOpen(true);
          void scanUploadPlaylist();
        }}
        onPullFilebase={() => void pullFilebaseZip()}
        filebasePullBusy={filebasePullBusy}
        filebasePullMessage={filebasePullMessage}
        filebasePullError={filebasePullError}
        canPullFilebase={isHosted && previewReady && Boolean(orgId)}
        ppConnected={Boolean(ppStatus?.connected)}
        ppAllowWrites={Boolean(ppStatus?.allowWrites)}
        playlistConflict={playlistConflict}
        showConflictItems={showConflictItems}
        onConfirmOverwrite={() => void runApply("overwrite")}
        onViewConflict={async () => {
          if (playlistConflict?.items.length) {
            setShowConflictItems(true);
            return;
          }
          const params = new URLSearchParams({ planId: planId.trim() });
          if (serviceTypeId.trim()) params.set("serviceTypeId", serviceTypeId.trim());
          const pre = await fetch(`/api/slide-deck/apply/preflight?${params}`);
          const data = (await pre.json()) as { conflict?: PlaylistConflictInfo | null };
          if (data.conflict) {
            setPlaylistConflict(data.conflict);
            setShowConflictItems(true);
          }
        }}
        onCancelConflict={() => {
          setPlaylistConflict(null);
          setShowConflictItems(false);
        }}
      />

      {canLocalApply && planId.trim() ? (
        <section className="flex flex-wrap gap-2 rounded-xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/30">
          <p className="w-full text-sm text-violet-950 dark:text-violet-100">
            Built in ProPresenter without Grapevine Create? Upload directly for rig delivery.
          </p>
          <button
            type="button"
            onClick={openByoUpload}
            className="h-11 rounded-xl border border-violet-700 px-4 text-sm font-medium text-violet-900 dark:border-violet-500 dark:text-violet-100"
          >
            Upload presentation (BYO)
          </button>
        </section>
      ) : null}

      {showUploadTool ? (
        <SlideDeckUploadTool
          playlistName={uploadDisplayPlaylistName}
          uploadBusy={uploadBusy}
          uploadScan={uploadScan}
          uploadPlaylistId={uploadPlaylistId}
          uploadDiffs={uploadDiffs}
          uploadDiffMatched={uploadDiffMatched}
          missingFiles={missingFiles}
          isByo={byoUploadMode}
          isAdmin={isAdmin}
          replaceOnRig={replaceOnRig}
          adminApproveForRig={adminApproveForRig}
          onReplaceOnRigChange={setReplaceOnRig}
          onAdminApproveForRigChange={setAdminApproveForRig}
          onScanPlaylist={(id) => void scanUploadPlaylist(id)}
          onUploadComplete={() => void saveHandoff("complete")}
          onUploadIncomplete={() => void saveHandoff("incomplete")}
          onCancel={() => {
            setUploadScan(null);
            setUploadPlaylistId("");
            setUploadDiffs(null);
            setUploadDiffMatched(false);
            setMissingFiles([]);
            setUploadToolOpen(false);
            setByoUploadMode(false);
          }}
        />
      ) : null}
    </ToolShell>
  );
}
