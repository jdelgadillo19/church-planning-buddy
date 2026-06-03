"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  detectRosterConflicts,
  rosterSelectionsComplete,
  type RosterSectionOverride,
} from "@/lib/docs/grg-roster-consolidate";
import { isPlatformTeamPositionName } from "@/lib/pco/roster-team-scope";
import { GoogleConnectionCard } from "@/components/google-connection-card";
import {
  DriveCandidateButtons,
  PcoAttachmentVariantButtons,
  PcoScanOptionButtons,
} from "@/components/grg-scan-picker-buttons";
import { PcoServicePlanPicker } from "@/components/pco-service-plan-picker";
import type { PcoScanAttachmentVariant } from "@/lib/pco/plan-bundle";
import { ToolShell } from "@/components/tool-shell";
import { useGoogleConnection } from "@/hooks/use-google-connection";
import { usePcoServicePlanSelection } from "@/hooks/use-pco-service-plan-selection";

type ScanTier = "green" | "yellow" | "red";

type PlanSong = {
  itemId: string;
  title: string;
  key: string;
  artist: string;
  sequence: number;
  scanTier: ScanTier;
  scanName: string;
  scanUrl: string;
  scanAttachmentId?: string;
  songId?: string;
  arrangementId?: string;
  warnings: string[];
  pcoScanVariants?: PcoScanAttachmentVariant[];
};

type PlanRosterRow = {
  teamMemberId: string;
  personId: string;
  displayName: string;
  pcoPositionName: string;
  positionName: string;
  teamId?: string;
  teamName?: string;
  grgSection: "band" | "choir" | "all_team" | "guest" | "other";
  status: string;
};

type PlanBundle = {
  planId: number;
  serviceTypeId: number;
  dateFormatted: string;
  dateRaw: string;
  suggestedOutputTitle: string;
  songs: PlanSong[];
  roster: PlanRosterRow[];
  rosterMapAdded: string[];
};

type RosterMapEntry = {
  pcoPosition: string;
  mapValue?: string;
  alias?: string;
  effectiveAlias: string;
  configured: boolean;
  strippedDefault: string;
  resolvedLabel: string;
};

type RosterPreviewEntry = {
  teamName: string;
  section: string;
  pcoPositionName: string;
  positionName: string;
  displayName: string;
  filledLine: string;
  mergedFrom?: string[];
};

type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  priorityScore?: number;
};

type DriveSearchRoot = {
  id: string;
  name: string;
  driveId?: string | null;
};

type PcoScanOption = {
  driveFileId: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  priorityScore: number;
  pcoAttachmentId: string;
  pcoAttachmentName: string;
  tier: ScanTier;
};

type SongWorkflow = {
  song: PlanSong;
  candidates: DriveCandidate[];
  selectedFileId: string;
  skipped: boolean;
  status: string;
  needsAck: boolean;
  searchRoot?: DriveSearchRoot;
  lastResolveError?: string;
  showManualPcoPicker?: boolean;
  pcoScanOptions?: PcoScanOption[];
  loadingPcoOptions?: boolean;
};

type CandidatesApiPayload =
  | {
      ok: true;
      candidates: DriveCandidate[];
      searchRoot?: DriveSearchRoot;
      pcoUrl?: string;
      resolvedScanUrl?: string;
      needsSelection?: boolean;
      needsAcknowledgement?: boolean;
      autoSelectedId?: string;
      pass?: 1 | 2;
      error?: string;
    }
  | { ok: false; error: string };

function shouldAutoResolveScan(flow: SongWorkflow) {
  if (flow.skipped) return false;
  if (flow.song.scanTier !== "green" && flow.song.scanTier !== "yellow") return false;
  return Boolean(flow.song.scanUrl?.trim() || flow.song.scanAttachmentId);
}

function applyCandidatesToFlow(flow: SongWorkflow, payload: CandidatesApiPayload): SongWorkflow {
  if (!payload.ok) {
    return {
      ...flow,
      status: payload.error,
      lastResolveError: payload.error,
    };
  }

  const candidates = payload.candidates ?? [];
  const resolvedUrl = payload.resolvedScanUrl || flow.song.scanUrl;
  const needsAck = Boolean(payload.needsAcknowledgement);
  const autoId = payload.autoSelectedId;
  const selectedFileId =
    autoId && candidates.some((c) => c.id === autoId)
      ? autoId
      : candidates.length === 1
        ? candidates[0].id
        : "";

  const searchLabel = payload.searchRoot?.name
    ? `Searched "${payload.searchRoot.name}" (from PCO link)`
    : null;
  const passNote = payload.pass === 2 ? " (priority fallback)" : "";

  return {
    ...flow,
    song: { ...flow.song, scanUrl: resolvedUrl },
    candidates,
    selectedFileId,
    needsAck,
    searchRoot: payload.searchRoot,
    lastResolveError: candidates.length === 0 ? payload.error : undefined,
    showManualPcoPicker: false,
    status: needsAck
      ? "Not Drive — acknowledge to skip"
      : candidates.length === 0
        ? payload.error ?? "No usable song scan found"
        : selectedFileId
          ? searchLabel
            ? `${searchLabel}${passNote} — auto-selected`
            : `Auto-selected${passNote}`
          : searchLabel
            ? `${searchLabel}${passNote} — pick a document (${candidates.length} matches)`
            : `Select a document (${candidates.length} matches)`,
  };
}

type PreviewSection = {
  title: string;
  bodyPreview: string;
  skipped: boolean;
  status?: "skipped" | "no-selection" | "ready" | "error";
  importMode?: string;
};

const STEPS = ["Setup", "Review", "Preview", "Sign off"] as const;
type Step = (typeof STEPS)[number];

const DEFAULT_GRG_OUTPUT_TITLE_PATTERN = "Get Ready Guide {{GRG_DATE}}";
const DEFAULT_GRG_TEMPLATE_TITLE = "Get Ready Guide (TEMPLATE)";
const RESOLVING_STATUS = "Resolving…";

function tierClass(tier: ScanTier) {
  if (tier === "green") return "text-emerald-600 dark:text-emerald-400";
  if (tier === "yellow") return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function songAttentionReasons(flow: SongWorkflow) {
  const reasons: string[] = [];

  if (flow.song.scanTier === "yellow") {
    reasons.push("Yellow-tier scan needs signoff");
  }
  if (flow.song.scanTier === "red") {
    reasons.push("No usable scan found");
  }
  if (flow.skipped) {
    reasons.push("Skipped");
  }
  if (flow.needsAck) {
    reasons.push("Non-Drive link needs acknowledgement");
  }
  if (flow.lastResolveError) {
    reasons.push(flow.lastResolveError);
  }
  if (!flow.skipped && flow.candidates.length > 1) {
    reasons.push("Multiple candidate docs");
  }
  if (
    !flow.skipped &&
    flow.status !== RESOLVING_STATUS &&
    !flow.selectedFileId &&
    flow.song.scanTier !== "red"
  ) {
    reasons.push("No selected scan doc");
  }

  return [...new Set(reasons)];
}

function songNeedsAttention(flow: SongWorkflow) {
  return songAttentionReasons(flow).length > 0;
}

function songIsCleanGreen(flow: SongWorkflow) {
  return (
    flow.song.scanTier === "green" &&
    !flow.skipped &&
    !flow.needsAck &&
    !flow.lastResolveError &&
    flow.status !== RESOLVING_STATUS &&
    Boolean(flow.selectedFileId) &&
    flow.candidates.length <= 1
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>("Setup");
  const planSelection = usePcoServicePlanSelection();
  const {
    planId,
    serviceTypeId,
    setServiceTypeId,
    serviceTypeOptions,
    planScope,
    upcomingPlans,
    busy: upcomingPlansBusy,
    error: upcomingPlansError,
    selectedPlan: selectedUpcomingPlan,
    loadOptions: loadUpcomingPlanOptions,
    selectPlan: selectUpcomingPlan,
  } = planSelection;
  const [grgTitle, setGrgTitle] = useState(DEFAULT_GRG_OUTPUT_TITLE_PATTERN);
  const [templateTitle, setTemplateTitle] = useState(DEFAULT_GRG_TEMPLATE_TITLE);
  const { connected: googleConnected } = useGoogleConnection();
  const [templateDoc, setTemplateDoc] = useState<{ id: string; name: string; webViewLink?: string } | null>(
    null,
  );
  const [grgDoc, setGrgDoc] = useState<{ id: string; name: string; webViewLink?: string } | null>(null);

  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [songFlows, setSongFlows] = useState<SongWorkflow[]>([]);
  const [activeSongIndex, setActiveSongIndex] = useState(0);

  const [preview, setPreview] = useState<{
    dateFormatted: string;
    songListLines: string[];
    roster?: Array<{
      pcoPositionName: string;
      positionName: string;
      displayName: string;
      teamName?: string;
      status: string;
    }>;
    rosterPreview?: RosterPreviewEntry[];
    sections: PreviewSection[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [pcoUploadBusy, setPcoUploadBusy] = useState(false);
  const [pcoUploadResult, setPcoUploadResult] = useState<string | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [showAliasPanel, setShowAliasPanel] = useState(false);
  const [aliasEntries, setAliasEntries] = useState<RosterMapEntry[]>([]);
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [savingAliases, setSavingAliases] = useState(false);
  const [guestSections, setGuestSections] = useState<Record<string, "band" | "choir">>({});
  const [rosterSelections, setRosterSelections] = useState<Record<string, string[]>>({});
  const [templateValidation, setTemplateValidation] = useState<{
    issues: Array<{ code: string; message: string; marker?: string; section?: string }>;
    canSkipIntro: boolean;
    canApplyScans: boolean;
  } | null>(null);
  const autoResolveGeneration = useRef(0);
  const autoPreviewAttempted = useRef(false);
  const buildPreviewRef = useRef<(() => Promise<void>) | null>(null);
  const guestRosterRows = (bundle?.roster ?? []).filter((r) => r.grgSection === "guest");
  const guestAssignmentsComplete =
    guestRosterRows.length === 0 ||
    guestRosterRows.every((r) => Boolean(guestSections[r.teamMemberId]));

  const guestOverrides = useMemo((): RosterSectionOverride => {
    const overrides: RosterSectionOverride = {};
    for (const row of bundle?.roster ?? []) {
      if (row.grgSection === "guest" && guestSections[row.teamMemberId]) {
        overrides[row.teamMemberId] = guestSections[row.teamMemberId];
      }
    }
    return overrides;
  }, [bundle?.roster, guestSections]);

  const rosterConflicts = useMemo(
    () => (bundle ? detectRosterConflicts(bundle.roster, guestOverrides) : []),
    [bundle, guestOverrides],
  );

  const rosterConflictSelectionsComplete = useMemo(
    () =>
      bundle
        ? rosterSelectionsComplete(bundle.roster, guestOverrides, rosterSelections)
        : true,
    [bundle, guestOverrides, rosterSelections],
  );

  function toggleRosterSelection(groupId: string, teamMemberId: string, checked: boolean) {
    setRosterSelections((prev) => {
      const next = new Set(prev[groupId] ?? []);
      if (checked) next.add(teamMemberId);
      else next.delete(teamMemberId);
      return { ...prev, [groupId]: [...next] };
    });
  }

  const activeSong = songFlows[activeSongIndex];

  const attentionSongIndexes = useMemo(
    () =>
      songFlows
        .map((flow, index) => ({ flow, index }))
        .filter(({ flow }) => songNeedsAttention(flow))
        .map(({ index }) => index),
    [songFlows],
  );

  const cleanGreenCount = useMemo(
    () => songFlows.filter((flow) => songIsCleanGreen(flow)).length,
    [songFlows],
  );

  const autoPreviewReady =
    Boolean(bundle) &&
    songFlows.length > 0 &&
    songFlows.every((flow) => songIsCleanGreen(flow)) &&
    guestAssignmentsComplete &&
    rosterConflictSelectionsComplete;

  const canLeaveSetup = useMemo(() => {
    return planId.trim().length > 0 && googleConnected && templateDoc?.id;
  }, [planId, googleConnected, templateDoc]);

  const lookupGrgOnDrive = useCallback(
    async (outputTitle: string) => {
      const res = await fetch("/api/mvp/find-grg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: outputTitle.trim(),
          templateTitle: templateTitle.trim(),
        }),
      });
      const payload = (await res.json()) as
        | {
            ok: true;
            template: { id: string; name: string; webViewLink?: string };
            output: { id: string; name: string; webViewLink?: string } | null;
            outputTitle: string;
          }
        | { ok: false; error: string };
      if (!res.ok || !payload.ok) throw new Error(payload.ok ? "Failed" : payload.error);
      setTemplateDoc(payload.template);
      setGrgDoc(payload.output);
      return payload;
    },
    [templateTitle],
  );

  useEffect(() => {
    if (step !== "Sign off" || !bundle || !googleConnected || !grgTitle.trim()) return;
    void lookupGrgOnDrive(grgTitle).catch(() => {
      /* keep prior grgDoc if lookup fails */
    });
  }, [step, bundle?.planId, grgTitle, googleConnected, lookupGrgOnDrive]);

  async function verifyGrgSetup() {
    setBusy(true);
    setError(null);
    try {
      await lookupGrgOnDrive(grgTitle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setTemplateDoc(null);
      setGrgDoc(null);
    } finally {
      setBusy(false);
    }
  }

  async function loadPlan() {
    setBusy(true);
    setError(null);
    setApplyResult(null);
    setPcoUploadResult(null);
    try {
      const res = await fetch("/api/mvp/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: planId.trim(),
          serviceTypeId: serviceTypeId.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as { ok: true; bundle: PlanBundle } | { ok: false; error: string };
      if (!res.ok || !payload.ok) throw new Error(payload.ok ? "Failed" : payload.error);

      setBundle(payload.bundle);
      setGuestSections({});
      setRosterSelections({});
      setGrgTitle(payload.bundle.suggestedOutputTitle);
      void refreshAliasPanel(payload.bundle);
      if ((payload.bundle.rosterMapAdded?.length ?? 0) > 0) {
        setShowAliasPanel(true);
      }
      const flows: SongWorkflow[] = payload.bundle.songs.map((song) => ({
        song,
        candidates: [],
        selectedFileId: "",
        skipped: song.scanTier === "red",
        status:
          song.scanTier === "red"
            ? "No scan — skip or fix in PCO"
            : (song.scanTier === "green" || song.scanTier === "yellow") &&
                (song.scanUrl?.trim() || song.scanAttachmentId)
              ? RESOLVING_STATUS
              : "Pending",
        needsAck: false,
      }));
      setSongFlows(flows);
      setActiveSongIndex(0);
      setPreview(null);
      autoPreviewAttempted.current = false;
      setStep("Review");
      const generation = ++autoResolveGeneration.current;
      void resolveAllSongCandidates(flows, generation);
      if (googleConnected) {
        void lookupGrgOnDrive(payload.bundle.suggestedOutputTitle).catch(() => {
          setGrgDoc(null);
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function fetchCandidatesForFlow(flow: SongWorkflow): Promise<CandidatesApiPayload> {
    const res = await fetch("/api/mvp/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scanUrl: flow.song.scanUrl,
        attachmentId: flow.song.scanAttachmentId,
        songId: flow.song.songId,
        arrangementId: flow.song.arrangementId,
        scanTier: flow.song.scanTier,
      }),
    });
    const payload = (await res.json()) as CandidatesApiPayload;
    if (!res.ok || !payload.ok) {
      return { ok: false, error: payload.ok ? "Failed to resolve blank scan" : payload.error };
    }
    return payload;
  }

  async function resolveCandidatesAtIndex(
    index: number,
    flow: SongWorkflow,
    generation: number,
  ) {
    try {
      const payload = await fetchCandidatesForFlow(flow);
      if (generation !== autoResolveGeneration.current) return;
      setSongFlows((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = applyCandidatesToFlow(next[index], payload);
        return next;
      });
    } catch (e) {
      if (generation !== autoResolveGeneration.current) return;
      const message = e instanceof Error ? e.message : "Unknown error";
      setSongFlows((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = { ...next[index], status: message, lastResolveError: message };
        return next;
      });
    }
  }

  async function resolveAllSongCandidates(initialFlows: SongWorkflow[], generation: number) {
    const targets = initialFlows
      .map((flow, index) => ({ flow, index }))
      .filter(({ flow }) => shouldAutoResolveScan(flow));

    if (targets.length === 0) return;

    setBulkResolving(true);
    setError(null);

    const concurrency = 4;
    for (let offset = 0; offset < targets.length; offset += concurrency) {
      if (generation !== autoResolveGeneration.current) break;
      const batch = targets.slice(offset, offset + concurrency);
      await Promise.all(
        batch.map(({ flow, index }) => resolveCandidatesAtIndex(index, flow, generation)),
      );
    }

    if (generation === autoResolveGeneration.current) {
      setBulkResolving(false);
    }
  }

  async function resolveCandidates(index: number) {
    const flow = songFlows[index];
    if (!flow || flow.skipped) return;

    setBusy(true);
    setError(null);
    updateSongFlow(index, {
      status: RESOLVING_STATUS,
      lastResolveError: undefined,
      showManualPcoPicker: false,
    });
    try {
      const generation = autoResolveGeneration.current;
      await resolveCandidatesAtIndex(index, flow, generation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function loadPcoScanOptions(index: number) {
    const flow = songFlows[index];
    if (!flow?.song.songId) return;

    updateSongFlow(index, { loadingPcoOptions: true, showManualPcoPicker: true, pcoScanOptions: [] });
    try {
      const res = await fetch("/api/mvp/pco-scan-options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          songId: flow.song.songId,
          arrangementId: flow.song.arrangementId,
        }),
      });
      const payload = (await res.json()) as
        | { ok: true; options: PcoScanOption[] }
        | { ok: false; error: string };
      if (!res.ok || !payload.ok) throw new Error(payload.ok ? "Failed" : payload.error);
      updateSongFlow(index, { pcoScanOptions: payload.options, loadingPcoOptions: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      updateSongFlow(index, { loadingPcoOptions: false, showManualPcoPicker: false });
    }
  }

  async function selectPcoScanAttachment(index: number, attachmentId: string) {
    const flow = songFlows[index];
    if (!flow) return;
    const variant = flow.song.pcoScanVariants?.find((v) => v.attachmentId === attachmentId);
    if (!variant) return;

    updateSongFlow(index, {
      song: {
        ...flow.song,
        scanAttachmentId: variant.attachmentId,
        scanName: variant.name,
        scanTier: variant.tier,
        scanUrl: variant.url,
      },
      candidates: [],
      selectedFileId: "",
      lastResolveError: undefined,
      status: `PCO source: ${variant.name}`,
    });
    await resolveCandidates(index);
  }

  function selectManualDriveDoc(index: number, option: PcoScanOption) {
    const flow = songFlows[index];
    if (!flow) return;

    const candidate: DriveCandidate = {
      id: option.driveFileId,
      name: option.name,
      mimeType: option.mimeType,
      webViewLink: option.webViewLink,
      priorityScore: option.priorityScore,
    };

    updateSongFlow(index, {
      selectedFileId: option.driveFileId,
      candidates: [candidate],
      showManualPcoPicker: false,
      pcoScanOptions: undefined,
      lastResolveError: undefined,
      status: `Manually selected: ${option.name}`,
    });
  }

  function updateSongFlow(index: number, patch: Partial<SongWorkflow>) {
    setSongFlows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function songListForApply() {
    return songFlows
      .filter((f) => !f.skipped)
      .map((f) => ({ title: f.song.title, key: f.song.key, artist: f.song.artist }));
  }

  function rosterForApply() {
    return (bundle?.roster ?? [])
      .map((r) => {
        let section = r.grgSection;
        if (section === "guest") {
          const picked = guestSections[r.teamMemberId];
          if (!picked) return null;
          section = picked;
        }
        if (section !== "band" && section !== "choir" && section !== "all_team") return null;
        return {
          teamMemberId: r.teamMemberId,
          pcoPositionName: r.pcoPositionName,
          positionName: r.positionName,
          displayName: r.displayName,
          teamName: r.teamName,
          status: r.status,
          grgSection: section,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  const refreshAliasPanel = useCallback(async (planBundle: PlanBundle) => {
    try {
      const res = await fetch("/api/mvp/roster-position-map");
      const payload = (await res.json()) as
        | { ok: true; entries: RosterMapEntry[] }
        | { ok: false; error: string };
      if (!res.ok || !payload.ok) return;

      const relevant = new Set<string>();
      for (const r of planBundle.roster) relevant.add(r.pcoPositionName);
      for (const a of planBundle.rosterMapAdded ?? []) relevant.add(a);

      const entries = payload.entries.filter(
        (e) => relevant.has(e.pcoPosition) && isPlatformTeamPositionName(e.pcoPosition),
      );
      setAliasEntries(entries);

      const drafts: Record<string, string> = {};
      for (const e of entries) {
        drafts[e.pcoPosition] = e.configured
          ? (e.mapValue ?? e.alias ?? e.effectiveAlias)
          : e.effectiveAlias;
      }
      setAliasDrafts(drafts);
    } catch {
      /* non-fatal */
    }
  }, []);

  async function savePositionAliases() {
    if (!bundle) return;
    setSavingAliases(true);
    setError(null);
    try {
      const aliases: Record<string, string> = {};
      for (const [pcoPosition, value] of Object.entries(aliasDrafts)) {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "[ALIAS]") continue;
        aliases[pcoPosition] = trimmed;
      }

      if (Object.keys(aliases).length === 0) {
        setError("No alias changes to save.");
        return;
      }

      const saveRes = await fetch("/api/mvp/roster-position-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aliases }),
      });
      const savePayload = (await saveRes.json()) as { ok: boolean; error?: string };
      if (!saveRes.ok || !savePayload.ok) {
        throw new Error(savePayload.error ?? "Failed to save aliases");
      }

      const planRes = await fetch("/api/mvp/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: String(bundle.planId),
          serviceTypeId: String(bundle.serviceTypeId),
        }),
      });
      const planPayload = (await planRes.json()) as
        | { ok: true; bundle: PlanBundle }
        | { ok: false; error: string };
      if (!planRes.ok || !planPayload.ok) {
        throw new Error(planPayload.ok ? "Failed to reload plan" : planPayload.error);
      }

      setBundle(planPayload.bundle);
      setSongFlows((prev) =>
        prev.map((flow) => {
          const updated = planPayload.bundle.songs.find((s) => s.itemId === flow.song.itemId);
          return updated ? { ...flow, song: updated } : flow;
        }),
      );
      await refreshAliasPanel(planPayload.bundle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingAliases(false);
    }
  }

  async function buildPreview() {
    if (!bundle) return;
    if (!guestAssignmentsComplete) {
      setError("Assign each Guest to BAND or CHOIR before preview.");
      return;
    }
    if (!rosterConflictSelectionsComplete) {
      setError("Select at least one position tag for each duplicate roster name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mvp/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: String(bundle.planId),
          grgDocTitle: grgTitle.trim(),
          dateFormatted: bundle.dateFormatted,
          songList: songListForApply(),
          roster: rosterForApply(),
          rosterSelections,
          songs: songFlows.map((f) => ({
            itemId: f.song.itemId,
            title: f.song.title,
            skipped: f.skipped,
            selectedFileId: f.selectedFileId || undefined,
          })),
        }),
      });
      const payload = (await res.json()) as
        | {
            ok: true;
            preview: {
              dateFormatted: string;
              songListLines: string[];
              roster?: Array<{
                pcoPositionName: string;
                positionName: string;
                displayName: string;
                teamName?: string;
                status: string;
              }>;
              rosterPreview?: RosterPreviewEntry[];
              sections: PreviewSection[];
            };
          }
        | { ok: false; error: string };
      if (!res.ok || !payload.ok) throw new Error(payload.ok ? "Failed" : payload.error);
      setPreview(payload.preview);
      setStep("Preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function applyChanges(options?: { skipIntro?: boolean }) {
    if (!bundle) return;
    if (!guestAssignmentsComplete) {
      setError("Assign each Guest to BAND or CHOIR before apply.");
      return;
    }
    if (!rosterConflictSelectionsComplete) {
      setError("Select at least one position tag for each duplicate roster name.");
      return;
    }
    setBusy(true);
    setError(null);
    setApplyResult(null);
    setTemplateValidation(null);
    try {
      const res = await fetch("/api/mvp/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          grgDocTitle: grgTitle.trim(),
          dateFormatted: bundle.dateFormatted,
          songList: songListForApply(),
          roster: rosterForApply(),
          rosterSelections,
          skipIntro: Boolean(options?.skipIntro),
          songs: songFlows.map((f) => ({
            itemId: f.song.itemId,
            title: f.song.title,
            skipped: f.skipped,
            selectedFileId: f.selectedFileId || undefined,
          })),
        }),
      });
      const payload = (await res.json()) as
        | { ok: true; grg: { id: string; name: string; webViewLink?: string }; errors?: string[] }
        | {
            ok: false;
            error: string;
            templateValidation?: {
              issues: Array<{ code: string; message: string }>;
              canSkipIntro: boolean;
              canApplyScans: boolean;
            };
          };
      if (!res.ok || !payload.ok) {
        if (!payload.ok && payload.templateValidation) {
          setTemplateValidation(payload.templateValidation);
        }
        throw new Error(payload.ok ? "Failed" : payload.error);
      }

      const extra = payload.errors?.length ? `\nWarnings:\n${payload.errors.join("\n")}` : "";
      setApplyResult(
        `Created/updated output doc "${payload.grg.name}" from template. Template was not modified.${extra}`,
      );
      setGrgDoc(payload.grg);
      setStep("Sign off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function postPdfToPlanningCenter() {
    if (!bundle || !grgDoc?.id) return;
    setPcoUploadBusy(true);
    setError(null);
    setPcoUploadResult(null);
    try {
      const res = await fetch("/api/mvp/export-grg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: String(bundle.planId),
          serviceTypeId: String(bundle.serviceTypeId),
          grgDocId: grgDoc.id,
          grgTitle: grgTitle.trim(),
        }),
      });
      const payload = (await res.json()) as
        | {
            ok: true;
            filename: string;
            attachmentId: string;
            itemId: string;
            itemTitle: string;
            deletedAttachmentId?: string;
          }
        | { ok: false; error: string };
      if (!res.ok || !payload.ok) throw new Error(payload.ok ? "Failed" : payload.error);
      const replaced = payload.deletedAttachmentId
        ? " Replaced the previous file on the Get Ready Guide item."
        : "";
      setPcoUploadResult(
        `Uploaded "${payload.filename}" to Planning Center item "${payload.itemTitle}".${replaced}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload to Planning Center failed.");
    } finally {
      setPcoUploadBusy(false);
    }
  }

  useEffect(() => {
    buildPreviewRef.current = buildPreview;
  });

  useEffect(() => {
    if (step !== "Review") return;
    if (busy || bulkResolving || autoPreviewAttempted.current || !autoPreviewReady) return;

    autoPreviewAttempted.current = true;
    window.setTimeout(() => {
      void buildPreviewRef.current?.();
    }, 0);
  }, [
    autoPreviewReady,
    bulkResolving,
    busy,
    step,
  ]);

  return (
    <ToolShell toolId="grg">
        <nav className="flex flex-wrap gap-2" aria-label="Get Ready Guide steps">
          {STEPS.map((s) => (
            <span
              key={s}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                step === s
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {s}
            </span>
          ))}
        </nav>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {applyResult ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {applyResult}
            {grgDoc?.webViewLink ? (
              <div className="mt-2">
                <a className="underline" href={grgDoc.webViewLink} target="_blank" rel="noreferrer">
                  Open Get Ready Guide
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "Setup" ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <PcoServicePlanPicker
              planId={planId}
              serviceTypeId={serviceTypeId}
              setServiceTypeId={setServiceTypeId}
              upcomingPlans={upcomingPlans}
              serviceTypeOptions={serviceTypeOptions}
              planScope={planScope}
              selectedPlan={selectedUpcomingPlan}
              busy={upcomingPlansBusy}
              error={upcomingPlansError}
              onSelectPlan={selectUpcomingPlan}
              onLoadOptions={loadUpcomingPlanOptions}
              serviceTypeLabel="Berlin plan type (advanced)"
              serviceTypeHint="Leave this as resolved unless you need another Berlin plan type."
            />
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">GRG template title (read-only source)</span>
              <input
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                className="h-11 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Must include {"{{GRG_DATE}}"}, {"{{GRG_SONG_LIST}}"}, {"{{GRG_SCANS_BEGIN}}"} — see docs/GRG-TEMPLATE.md
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">GRG output title (recreated each Approve)</span>
              <input
                value={grgTitle}
                onChange={(e) => setGrgTitle(e.target.value)}
                className="h-11 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Defaults to &quot;Get Ready Guide YYYY.MM.DD&quot; from the plan date after load (editable).
              </span>
            </label>

            <GoogleConnectionCard
              compact
              hint="Required for scan fetch and GRG writes (reconnect after scope updates)."
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!googleConnected || busy}
                onClick={verifyGrgSetup}
                className="inline-flex h-11 items-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Verify template on Drive
              </button>
              {templateDoc ? (
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                  Template: {templateDoc.name}
                  {templateDoc.webViewLink ? (
                    <>
                      {" "}
                      <a className="underline" href={templateDoc.webViewLink} target="_blank" rel="noreferrer">
                        open
                      </a>
                    </>
                  ) : null}
                </span>
              ) : null}
              {grgDoc ? (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Existing output: {grgDoc.name} (will be replaced on Approve)
                </span>
              ) : (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  No output doc yet — created on Approve
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={!canLeaveSetup || busy}
              onClick={loadPlan}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? "Loading…" : "Load plan & continue"}
            </button>
          </section>
        ) : null}

        {step === "Review" && bundle && activeSong ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {(bundle.rosterMapAdded?.length ?? 0) > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {bundle.rosterMapAdded.length} new PCO position
                {bundle.rosterMapAdded.length === 1 ? "" : "s"} added to{" "}
                <code className="text-xs">docs/roster-position-map.json</code>. Unset aliases use the
                PCO name with BAND-/CHOIR- prefix removed.
              </div>
            ) : null}

            {(bundle.roster?.length ?? 0) > 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950">
                <div className="font-medium">Platform Team roster loaded</div>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {bundle.roster.length} confirmed worship assignment
                  {bundle.roster.length === 1 ? "" : "s"} from Planning Center.
                </p>
              </div>
            ) : null}

            {guestRosterRows.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm dark:border-amber-900 dark:bg-amber-950">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  Guest assignments
                </div>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  Choose whether each guest appears in the BAND or CHOIR section of the Get Ready
                  Guide.
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {guestRosterRows.map((row) => (
                    <li
                      key={row.teamMemberId}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 dark:border-amber-900 dark:bg-zinc-950"
                    >
                      <span className="font-medium">
                        {row.displayName}: {row.positionName}
                      </span>
                      <label className="flex items-center gap-1 text-xs">
                        <span className="text-zinc-500">Section</span>
                        <select
                          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
                          value={guestSections[row.teamMemberId] ?? ""}
                          onChange={(e) =>
                            setGuestSections((prev) => ({
                              ...prev,
                              [row.teamMemberId]: e.target.value as "band" | "choir",
                            }))
                          }
                        >
                          <option value="">Select…</option>
                          <option value="band">BAND</option>
                          <option value="choir">CHOIR</option>
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {rosterConflicts.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm dark:border-amber-900 dark:bg-amber-950">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  Duplicate roster roles
                </div>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  The same person has multiple confirmed positions in one section. Check one tag
                  for a single role, or multiple tags to combine on one line (e.g. MD / Keys).
                </p>
                <ul className="mt-3 flex flex-col gap-3">
                  {rosterConflicts.map((group) => (
                    <li
                      key={group.groupId}
                      className="rounded-lg border border-amber-100 bg-white px-3 py-2 dark:border-amber-900 dark:bg-zinc-950"
                    >
                      <div className="font-medium">
                        {group.section.toUpperCase()}: {group.displayName}
                      </div>
                      <div className="mt-2 flex flex-col gap-1">
                        {group.assignments.map((assignment) => {
                          const checked = (rosterSelections[group.groupId] ?? []).includes(
                            assignment.teamMemberId,
                          );
                          return (
                            <label
                              key={assignment.teamMemberId}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  toggleRosterSelection(
                                    group.groupId,
                                    assignment.teamMemberId,
                                    e.target.checked,
                                  )
                                }
                              />
                              <span>{assignment.positionName}</span>
                              <span className="text-xs text-zinc-500">
                                ({assignment.pcoPositionName})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
                onClick={() => {
                  const next = !showAliasPanel;
                  setShowAliasPanel(next);
                  if (next && aliasEntries.length === 0) void refreshAliasPanel(bundle);
                }}
              >
                Position aliases (optional)
                <span className="text-zinc-500">{showAliasPanel ? "▾" : "▸"}</span>
              </button>
              {showAliasPanel ? (
                <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
                  <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
                    Map PCO position names to GRG template labels. Leave blank to use the stripped
                    default (e.g. BAND - Drums → Drums).
                  </p>
                  {aliasEntries.length === 0 ? (
                    <p className="text-sm text-zinc-500">No positions on this plan yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {aliasEntries.map((entry) => (
                        <div
                          key={entry.pcoPosition}
                          className="grid gap-2 rounded-lg border border-zinc-100 p-2 text-sm dark:border-zinc-900 sm:grid-cols-[1fr_1fr_auto]"
                        >
                          <div>
                            <div className="text-xs text-zinc-500">PCO position</div>
                            <div className="font-medium">{entry.pcoPosition}</div>
                          </div>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-zinc-500">Template alias</span>
                            <input
                              type="text"
                              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900"
                              placeholder={entry.strippedDefault}
                              value={aliasDrafts[entry.pcoPosition] ?? ""}
                              onChange={(e) =>
                                setAliasDrafts((prev) => ({
                                  ...prev,
                                  [entry.pcoPosition]: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <div className="self-end text-xs text-zinc-500">
                            {entry.configured ? "custom alias" : "default (prefix stripped)"}
                            <div className="text-zinc-400">→ {entry.effectiveAlias}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={savingAliases || aliasEntries.length === 0}
                    onClick={savePositionAliases}
                    className="mt-3 h-9 rounded-xl border px-3 text-sm disabled:opacity-50 dark:border-zinc-700"
                  >
                    {savingAliases ? "Saving…" : "Save aliases & refresh roster"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Scan review</h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {bulkResolving
                      ? "Resolving song scans from Planning Center and Drive."
                      : attentionSongIndexes.length > 0
                        ? `${attentionSongIndexes.length} song${
                            attentionSongIndexes.length === 1 ? "" : "s"
                          } need attention before signoff.`
                        : "All songs are clean green and ready for preview."}
                  </p>
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {cleanGreenCount} of {songFlows.length} songs clean green
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    busy ||
                    bulkResolving ||
                    !guestAssignmentsComplete ||
                    !rosterConflictSelectionsComplete
                  }
                  onClick={buildPreview}
                  className="h-10 rounded-xl bg-zinc-900 px-3 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {attentionSongIndexes.length > 0 ? "Preview with warnings" : "Preview now"}
                </button>
              </div>

              {bulkResolving ? (
                <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  Background scan resolution is still running.
                </div>
              ) : null}

              {!bulkResolving && attentionSongIndexes.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-3">
                  {attentionSongIndexes.map((index) => {
                    const flow = songFlows[index];
                    const reasons = songAttentionReasons(flow);
                    return (
                      <li
                        key={flow.song.itemId}
                        className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{flow.song.title}</div>
                            <div className={`text-xs font-medium ${tierClass(flow.song.scanTier)}`}>
                              {flow.song.scanTier.toUpperCase()}
                              {flow.song.scanName ? ` — ${flow.song.scanName}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              Status: {flow.status}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSongIndex(index)}
                            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            Details
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {reasons.map((reason) => (
                            <span
                              key={reason}
                              className="rounded-full bg-white px-2 py-1 text-xs text-amber-900 dark:bg-zinc-950 dark:text-amber-200"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {!flow.skipped &&
                          flow.status !== RESOLVING_STATUS &&
                          (flow.candidates.length === 0 ||
                            flow.candidates.length > 1 ||
                            Boolean(flow.lastResolveError)) ? (
                            <button
                              type="button"
                              disabled={busy || bulkResolving}
                              onClick={() => resolveCandidates(index)}
                              className="h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-950"
                            >
                              {flow.candidates.length > 0 ? "Retry search" : "Find blank scan"}
                            </button>
                          ) : null}
                          {!flow.skipped && flow.song.songId ? (
                            <button
                              type="button"
                              disabled={busy || bulkResolving || flow.loadingPcoOptions}
                              onClick={() => loadPcoScanOptions(index)}
                              className="h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-950"
                            >
                              {flow.loadingPcoOptions ? "Loading scans…" : "Manual select"}
                            </button>
                          ) : null}
                          <label className="flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs dark:border-amber-800 dark:bg-zinc-950">
                            <input
                              type="checkbox"
                              checked={flow.skipped}
                              onChange={(e) =>
                                updateSongFlow(index, {
                                  skipped: e.target.checked,
                                  status: e.target.checked ? "Skipped" : "Pending",
                                })
                              }
                            />
                            Skip
                          </label>
                        </div>

                        {!flow.skipped && (flow.song.pcoScanVariants?.length ?? 0) > 1 ? (
                          <div className="mt-3 flex flex-col gap-2">
                            <div className="text-xs font-medium">Choose PCO scan source</div>
                            <PcoAttachmentVariantButtons
                              variants={flow.song.pcoScanVariants!}
                              selectedAttachmentId={flow.song.scanAttachmentId}
                              onSelect={(attachmentId) => void selectPcoScanAttachment(index, attachmentId)}
                            />
                          </div>
                        ) : null}

                        {flow.showManualPcoPicker && flow.pcoScanOptions ? (
                          <div className="mt-3 flex flex-col gap-2">
                            <div className="text-xs font-medium">Drive documents by priority</div>
                            {flow.pcoScanOptions.length === 0 ? (
                              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                No documents found inside PCO song scan folders.
                              </div>
                            ) : (
                              <PcoScanOptionButtons
                                options={flow.pcoScanOptions}
                                onSelect={(opt) => selectManualDriveDoc(index, opt)}
                              />
                            )}
                          </div>
                        ) : null}

                        {flow.candidates.length > 1 ||
                        (flow.candidates.length === 1 && !flow.selectedFileId) ? (
                          <div className="mt-3 flex flex-col gap-2">
                            <div className="text-xs font-medium">Select document to incorporate</div>
                            <DriveCandidateButtons
                              candidates={flow.candidates}
                              selectedId={flow.selectedFileId}
                              groupName={`quick-pick-${index}`}
                              onSelect={(id, name) =>
                                updateSongFlow(index, {
                                  selectedFileId: id,
                                  status: `Selected: ${name}`,
                                })
                              }
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="text-xs font-medium uppercase text-zinc-500 dark:text-zinc-400">
                Detailed song editor
              </div>
            </div>

            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Song {activeSongIndex + 1} of {songFlows.length} · Plan date: {bundle.dateFormatted}
            </div>
            <h2 className="text-lg font-semibold">{activeSong.song.title}</h2>
            {activeSong.song.key ? (
              <div className="text-sm text-zinc-700 dark:text-zinc-300">
                Key: <span className="font-medium">{activeSong.song.key}</span>
              </div>
            ) : null}
            <div className={`text-sm font-medium ${tierClass(activeSong.song.scanTier)}`}>
              Scan tier: {activeSong.song.scanTier.toUpperCase()}
              {activeSong.song.scanName ? ` — ${activeSong.song.scanName}` : ""}
            </div>
            {activeSong.song.warnings.map((w) => (
              <div key={w} className="text-sm text-amber-700 dark:text-amber-300">
                {w}
              </div>
            ))}
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Status: {activeSong.status}</div>

            {activeSong.song.scanUrl ? (
              <div className="text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">PCO scan link: </span>
                <a
                  className="break-all underline underline-offset-2"
                  href={activeSong.song.scanUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {activeSong.song.scanUrl}
                </a>
              </div>
            ) : null}

            {activeSong.searchRoot ? (
              <div className="text-sm text-zinc-700 dark:text-zinc-300">
                Searching from: <span className="font-medium">{activeSong.searchRoot.name}</span>
                {activeSong.searchRoot.driveId ? (
                  <span className="text-zinc-500"> (shared drive)</span>
                ) : null}
              </div>
            ) : null}

            {activeSong.lastResolveError && activeSong.candidates.length === 0 ? (
              <div className="text-sm text-amber-700 dark:text-amber-300">{activeSong.lastResolveError}</div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {!activeSong.skipped &&
              activeSong.status !== RESOLVING_STATUS &&
              (activeSong.candidates.length === 0 ||
                activeSong.candidates.length > 1 ||
                Boolean(activeSong.lastResolveError)) ? (
                <button
                  type="button"
                  disabled={busy || bulkResolving || activeSong.skipped}
                  onClick={() => resolveCandidates(activeSongIndex)}
                  className="inline-flex h-10 items-center rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                >
                  {activeSong.candidates.length > 0 ? "Retry blank scan search" : "Find blank scan on Drive"}
                </button>
              ) : null}
              {!activeSong.skipped && activeSong.song.songId ? (
                <button
                  type="button"
                  disabled={busy || bulkResolving || activeSong.loadingPcoOptions}
                  onClick={() => loadPcoScanOptions(activeSongIndex)}
                  className="inline-flex h-10 items-center rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                >
                  {activeSong.loadingPcoOptions ? "Loading PCO scans…" : "Manually select song scan"}
                </button>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={activeSong.skipped}
                  onChange={(e) =>
                    updateSongFlow(activeSongIndex, {
                      skipped: e.target.checked,
                      status: e.target.checked ? "Skipped" : "Pending",
                    })
                  }
                />
                Skip this song
              </label>
            </div>

            {!activeSong.skipped && (activeSong.song.pcoScanVariants?.length ?? 0) > 1 ? (
              <div className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/30">
                <div className="text-sm font-medium">Choose PCO scan source</div>
                <PcoAttachmentVariantButtons
                  variants={activeSong.song.pcoScanVariants!}
                  selectedAttachmentId={activeSong.song.scanAttachmentId}
                  onSelect={(attachmentId) =>
                    void selectPcoScanAttachment(activeSongIndex, attachmentId)
                  }
                />
              </div>
            ) : null}

            {activeSong.showManualPcoPicker && activeSong.pcoScanOptions ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="text-sm font-medium">Drive documents (by priority)</div>
                {activeSong.pcoScanOptions.length === 0 ? (
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    No documents found inside PCO song scan folders.
                  </div>
                ) : (
                  <PcoScanOptionButtons
                    options={activeSong.pcoScanOptions}
                    onSelect={(opt) => selectManualDriveDoc(activeSongIndex, opt)}
                  />
                )}
              </div>
            ) : null}

            {activeSong.needsAck ? (
              <button
                type="button"
                className="text-sm underline"
                onClick={() =>
                  updateSongFlow(activeSongIndex, {
                    skipped: true,
                    needsAck: false,
                    status: "Acknowledged — skipped",
                  })
                }
              >
                Acknowledge non-Drive link and skip
              </button>
            ) : null}

            {activeSong.candidates.length > 1 ||
            (activeSong.candidates.length === 1 && !activeSong.selectedFileId) ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Select document to incorporate</div>
                <DriveCandidateButtons
                  candidates={activeSong.candidates}
                  selectedId={activeSong.selectedFileId}
                  groupName={`pick-${activeSongIndex}`}
                  onSelect={(id, name) =>
                    updateSongFlow(activeSongIndex, {
                      selectedFileId: id,
                      status: `Selected: ${name}`,
                    })
                  }
                />
              </div>
            ) : null}

            <div className="flex justify-between gap-3">
              <button
                type="button"
                disabled={activeSongIndex === 0}
                onClick={() => setActiveSongIndex((i) => Math.max(0, i - 1))}
                className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800"
              >
                Previous song
              </button>
              {activeSongIndex < songFlows.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveSongIndex((i) => i + 1)}
                  className="h-10 rounded-xl bg-zinc-900 px-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Next song
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !guestAssignmentsComplete || !rosterConflictSelectionsComplete}
                  onClick={buildPreview}
                  className="h-10 rounded-xl bg-zinc-900 px-3 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Preview GRG changes
                </button>
              )}
            </div>
          </section>
        ) : null}

        {step === "Preview" && preview ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">Preview (no writes yet)</h2>
            <div className="text-sm">
              <div className="font-medium">Date</div>
              <div>{preview.dateFormatted}</div>
            </div>
            <div className="text-sm">
              <div className="font-medium">Song list</div>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900">
                {preview.songListLines.join("\n")}
              </pre>
            </div>
            {(preview.rosterPreview?.length ?? 0) > 0 ? (
              <div className="text-sm">
                <div className="font-medium">Team roster (confirmed from PCO → GRG)</div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Confirmed Platform Team positions from Planning Center. BAND / CHOIR sections are
                  determined by the position prefix (e.g. BAND - Cajon, CHOIR - WL).
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {(preview.rosterPreview ?? []).map((entry) => (
                    <li
                      key={`${entry.teamName}-${entry.pcoPositionName}-${entry.displayName}`}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950"
                    >
                      <span className="font-medium">{entry.section.toUpperCase()}</span>
                      <span className="text-zinc-700 dark:text-zinc-300"> — {entry.filledLine}</span>
                      {entry.mergedFrom && entry.mergedFrom.length > 1 ? (
                        <span className="block text-xs text-zinc-500">
                          Merged: {entry.mergedFrom.join(", ")}
                        </span>
                      ) : (
                        <span className="block text-xs text-zinc-500">
                          PCO: {entry.pcoPositionName}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                No confirmed Platform Team worship positions on this plan.
              </div>
            )}
            {preview.sections.map((s) => (
              <div key={s.title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {s.status === "skipped"
                    ? "Skipped by you"
                    : s.status === "no-selection"
                      ? "No scan selected — will not write this song"
                      : s.status === "error"
                        ? "Scan preview error"
                        : s.status === "ready"
                          ? `Will include on apply${s.importMode ? ` (${s.importMode} import)` : ""}`
                          : s.skipped
                            ? "Skipped"
                            : "Will include on apply"}
                </div>
                {s.skipped && s.status !== "no-selection" ? (
                  <div className="text-sm text-zinc-500">No content</div>
                ) : (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
                    {s.bodyPreview || "(empty)"}
                  </pre>
                )}
              </div>
            ))}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("Review")}
                className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("Sign off")}
                className="h-10 rounded-xl bg-zinc-900 px-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Continue to signoff
              </button>
            </div>
          </section>
        ) : null}

        {step === "Sign off" ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">Sign off</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Approving copies <strong>{templateTitle}</strong> to a fresh <strong>{grgTitle}</strong> output doc,
              fills date, confirmed roster names, and song list placeholders, then replaces everything after{" "}
              <code className="text-xs">{"{{GRG_SCANS_BEGIN}}"}</code> with this week&apos;s scans. The template is
              never modified. Cancel leaves all Drive docs unchanged.
            </p>
            {templateValidation ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm dark:border-amber-900 dark:bg-amber-950">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  Template placeholder issues
                </div>
                <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-300">
                  {templateValidation.issues.map((issue) => (
                    <li key={issue.message}>{issue.message}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  {templateValidation.canSkipIntro ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void applyChanges({ skipIntro: true })}
                      className="h-9 rounded-lg bg-amber-800 px-3 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Skip intro & apply scans only
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setTemplateValidation(null)}
                    className="h-9 rounded-lg border border-amber-300 px-3 text-xs dark:border-amber-800"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            {pcoUploadResult ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                {pcoUploadResult}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={
                  busy || !guestAssignmentsComplete || !rosterConflictSelectionsComplete
                }
                onClick={() => void applyChanges()}
                className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Applying…" : "Approve & update Google Doc"}
              </button>
              <button
                type="button"
                disabled={busy || pcoUploadBusy || !bundle || !grgDoc?.id || !googleConnected}
                onClick={() => void postPdfToPlanningCenter()}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {pcoUploadBusy ? "Uploading PDF…" : "Print & attach to Planning Center"}
              </button>
              <button
                type="button"
                onClick={() => setStep("Preview")}
                className="h-11 rounded-xl border px-4 text-sm dark:border-zinc-800"
              >
                Back to preview
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("Setup");
                  setPreview(null);
                  setApplyResult(null);
                  setPcoUploadResult(null);
                }}
                className="h-11 rounded-xl border px-4 text-sm dark:border-zinc-800"
              >
                Cancel
              </button>
            </div>
            {!grgDoc?.id ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No dated output in Drive yet — run Approve or place{" "}
                <strong>{grgTitle}</strong> in the Output folder, then print &amp; attach.
              </p>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Using output doc <strong>{grgDoc.name}</strong> from Drive (Approve optional if it is
                already up to date).
              </p>
            )}
          </section>
        ) : null}
    </ToolShell>
  );
}
