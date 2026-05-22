"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
};

type PlanBundle = {
  planId: number;
  serviceTypeId: number;
  dateFormatted: string;
  dateRaw: string;
  songs: PlanSong[];
};

type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

type DriveSearchRoot = {
  id: string;
  name: string;
  driveId?: string | null;
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
};

type PreviewSection = {
  title: string;
  bodyPreview: string;
  skipped: boolean;
  status?: "skipped" | "no-selection" | "ready" | "error";
};

const STEPS = ["Setup", "Songs", "Preview", "Sign off"] as const;
type Step = (typeof STEPS)[number];

const DEFAULT_GRG_OUTPUT_TITLE = "Get Ready Guide (Good Friday)";
const DEFAULT_GRG_TEMPLATE_TITLE = "Get Ready Guide (TEMPLATE)";

function tierClass(tier: ScanTier) {
  if (tier === "green") return "text-emerald-600 dark:text-emerald-400";
  if (tier === "yellow") return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function Home() {
  const [step, setStep] = useState<Step>("Setup");
  const [planId, setPlanId] = useState("87788328");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [grgTitle, setGrgTitle] = useState(DEFAULT_GRG_OUTPUT_TITLE);
  const [templateTitle, setTemplateTitle] = useState(DEFAULT_GRG_TEMPLATE_TITLE);
  const [googleConnected, setGoogleConnected] = useState(false);
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
    sections: PreviewSection[];
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  const refreshGoogle = useCallback(async () => {
    const res = await fetch("/api/auth/google/status");
    const data = (await res.json()) as { connected?: boolean };
    setGoogleConnected(Boolean(data.connected));
  }, []);

  useEffect(() => {
    refreshGoogle();
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") refreshGoogle();
  }, [refreshGoogle]);

  const activeSong = songFlows[activeSongIndex];

  const canLeaveSetup = useMemo(() => {
    return planId.trim().length > 0 && googleConnected && templateDoc?.id;
  }, [planId, googleConnected, templateDoc]);

  async function verifyGrgSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mvp/find-grg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: grgTitle.trim(),
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
      setSongFlows(
        payload.bundle.songs.map((song) => ({
          song,
          candidates: [],
          selectedFileId: "",
          skipped: song.scanTier === "red",
          status: song.scanTier === "red" ? "No scan — skip or fix in PCO" : "Pending",
          needsAck: false,
        })),
      );
      setActiveSongIndex(0);
      setStep("Songs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function resolveCandidates(index: number) {
    const flow = songFlows[index];
    if (!flow || flow.skipped) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mvp/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scanUrl: flow.song.scanUrl,
          attachmentId: flow.song.scanAttachmentId,
          songId: flow.song.songId,
          arrangementId: flow.song.arrangementId,
        }),
      });
      const payload = (await res.json()) as
        | {
            ok: true;
            candidates: DriveCandidate[];
            searchRoot?: DriveSearchRoot;
            pcoUrl?: string;
            resolvedScanUrl?: string;
            needsSelection?: boolean;
            needsAcknowledgement?: boolean;
            error?: string;
          }
        | { ok: false; error: string };

      if (!res.ok || !payload.ok) throw new Error(payload.ok ? "Failed" : payload.error);

      const candidates = payload.candidates ?? [];
      const resolvedUrl = payload.resolvedScanUrl || flow.song.scanUrl;
      const needsAck = Boolean(payload.needsAcknowledgement);
      let selectedFileId = "";
      if (candidates.length === 1) selectedFileId = candidates[0].id;

      const searchLabel = payload.searchRoot?.name
        ? `Searched "${payload.searchRoot.name}" (from PCO link)`
        : null;

      setSongFlows((prev) => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          song: { ...next[index].song, scanUrl: resolvedUrl },
          candidates,
          selectedFileId,
          needsAck,
          searchRoot: payload.searchRoot,
          lastResolveError: payload.error,
          status:
            needsAck
              ? "Not Drive — acknowledge to skip"
              : candidates.length === 0
                ? payload.error ?? "No blank docs found"
                : candidates.length === 1
                  ? searchLabel
                    ? `${searchLabel} — auto-selected`
                    : "Auto-selected single match"
                  : searchLabel
                    ? `${searchLabel} — ${candidates.length} matches`
                    : `Select a document (${candidates.length} matches)`,
        };
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
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

  async function buildPreview() {
    if (!bundle) return;
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
          songs: songFlows.map((f) => ({
            itemId: f.song.itemId,
            title: f.song.title,
            skipped: f.skipped,
            selectedFileId: f.selectedFileId || undefined,
          })),
        }),
      });
      const payload = (await res.json()) as
        | { ok: true; preview: { dateFormatted: string; songListLines: string[]; sections: PreviewSection[] } }
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

  async function applyChanges() {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/mvp/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          grgDocTitle: grgTitle.trim(),
          dateFormatted: bundle.dateFormatted,
          songList: songListForApply(),
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
        | { ok: false; error: string };
      if (!res.ok || !payload.ok) throw new Error(payload.ok ? "Failed" : payload.error);

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

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Church Planning Buddy</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Update your Get Ready Guide from a Planning Center plan — with signoff before any writes.
          </p>
        </header>

        <nav className="flex flex-wrap gap-2">
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
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Plan ID</span>
              <input
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="h-11 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Service Type ID (optional)</span>
              <input
                value={serviceTypeId}
                onChange={(e) => setServiceTypeId(e.target.value)}
                className="h-11 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>
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
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/auth/google/start"
                className="inline-flex h-11 items-center rounded-xl border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-800"
              >
                {googleConnected ? "Reconnect Google" : "Connect Google"}
              </a>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {googleConnected
                  ? "Connected"
                  : "Required for scan fetch and GRG writes (reconnect after scope updates)"}
              </span>
            </div>

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

        {step === "Songs" && bundle && activeSong ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
              <button
                type="button"
                disabled={busy || activeSong.skipped}
                onClick={() => resolveCandidates(activeSongIndex)}
                className="inline-flex h-10 items-center rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
              >
                Find blank scan on Drive
              </button>
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

            {activeSong.candidates.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Select document to incorporate</div>
                {activeSong.candidates.map((c) => (
                  <label key={c.id} className="flex items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <input
                      type="radio"
                      name={`pick-${activeSongIndex}`}
                      checked={activeSong.selectedFileId === c.id}
                      onChange={() =>
                        updateSongFlow(activeSongIndex, {
                          selectedFileId: c.id,
                          status: `Selected: ${c.name}`,
                        })
                      }
                    />
                    <span>
                      {c.name}
                      {c.webViewLink ? (
                        <>
                          {" "}
                          <a className="underline" href={c.webViewLink} target="_blank" rel="noreferrer">
                            open
                          </a>
                        </>
                      ) : null}
                    </span>
                  </label>
                ))}
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
                  disabled={busy}
                  onClick={buildPreview}
                  className="h-10 rounded-xl bg-zinc-900 px-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
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
                          ? "Will include on apply"
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
                onClick={() => setStep("Songs")}
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
              fills date and song list placeholders, then replaces everything after{" "}
              <code className="text-xs">{"{{GRG_SCANS_BEGIN}}"}</code> with this week&apos;s scans. The template is
              never modified. Cancel leaves all Drive docs unchanged.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={applyChanges}
                className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Applying…" : "Approve & update Google Doc"}
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
                }}
                className="h-11 rounded-xl border px-4 text-sm dark:border-zinc-800"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
