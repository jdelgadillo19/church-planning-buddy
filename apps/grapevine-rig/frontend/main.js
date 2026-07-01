const invoke = window.__TAURI__?.core?.invoke;
if (!invoke) {
  throw new Error("Grapevine Client must run inside the Tauri app.");
}

const API_BASE_DEFAULT = "https://grapevineprep.com";
const POLL_MS = 5000;
const PP_HOST = "127.0.0.1";

const $ = (id) => document.getElementById(id);

const pairScreen = $("pair-screen");
const mainScreen = $("main-screen");
const statusBadge = $("status-badge");
const pairCode = $("pair-code");
const pairName = $("pair-name");
const pairBtn = $("pair-btn");
const pairError = $("pair-error");
const rigLabel = $("rig-label");
const buildCard = $("build-card");
const buildTitle = $("build-title");
const buildSummary = $("build-summary");
const buildError = $("build-error");
const conflictCard = $("conflict-card");
const conflictMessage = $("conflict-message");
const conflictOverwriteBtn = $("conflict-overwrite-btn");
const conflictViewBtn = $("conflict-view-btn");
const conflictDismissBtn = $("conflict-dismiss-btn");
const changeDetail = $("change-detail");
const implReview = $("impl-review");
const noBuild = $("no-build");
const handoffCard = $("handoff-card");
const handoffTitle = $("handoff-title");
const handoffSummary = $("handoff-summary");
const handoffImportBtn = $("handoff-import-btn");
const handoffSkipBtn = $("handoff-skip-btn");
const handoffPickerWrap = $("handoff-picker-wrap");
const handoffPicker = $("handoff-picker");
const noHandoff = $("no-handoff");
const applyBtn = $("apply-btn");
const changeDetailsEl = document.querySelector("details.details");
const scanBtn = $("scan-btn");
const settingsBtn = $("settings-btn");
const unpairConfirm = $("unpair-confirm");
const unpairConfirmBtn = $("unpair-confirm-btn");
const unpairCancelBtn = $("unpair-cancel-btn");
const actionStatus = $("action-status");
const ppPort = $("pp-port");
const ppTransport = $("pp-transport");
const ppBundleRoot = $("pp-bundle-root");
const ppSaveBtn = $("pp-save-btn");
const ppSettingsStatus = $("pp-settings-status");
const remoteOpenBtn = $("remote-open-btn");

let creds = null;
let pendingBuild = null;
let pendingHandoff = null;
let pendingHandoffs = [];
let lastAutoHandoffId = null;
let editedImplPlan = null;
let playlistConflict = null;
let pollTimer = null;
let busy = false;

function parsePlaylistConflictFromText(text) {
  if (!text) return null;
  const match = text.match(
    /playlist named "([^"]+)" already exists with (\d+) item/i,
  );
  if (!match) return null;
  return {
    playlistName: match[1],
    itemCount: Number.parseInt(match[2], 10),
    playlistId: "",
  };
}

function parseConflictFromWorkerError(err) {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  if (msg.startsWith("CONFLICT:")) {
    try {
      const payload = JSON.parse(msg.slice("CONFLICT:".length));
      if (payload.conflict) {
        return {
          playlistId: payload.playlistId ?? "",
          playlistName: payload.playlistName ?? "",
          itemCount: payload.itemCount ?? 0,
          message: payload.message ?? msg,
        };
      }
    } catch {
      /* fall through */
    }
  }
  const fromText = parsePlaylistConflictFromText(msg);
  if (fromText) {
    return { ...fromText, message: msg };
  }
  return null;
}

function showConflictCard(conflict) {
  playlistConflict = conflict;
  conflictCard.classList.remove("hidden");
  conflictMessage.textContent =
    conflict.message ??
    `Playlist "${conflict.playlistName}" already has ${conflict.itemCount} item(s). Overwrite replaces it with this build.`;
}

function hideConflictCard() {
  playlistConflict = null;
  conflictCard.classList.add("hidden");
  conflictMessage.textContent = "";
}

async function resetBuildForRetry(buildId) {
  const data = await apiFetch(`/api/pp/rigs/${creds.rigId}/builds/${buildId}`, {
    method: "PATCH",
    body: JSON.stringify({ resetToClaimed: true }),
  });
  if (data.build) pendingBuild = data.build;
}

function setBadge(kind, text) {
  statusBadge.className = `badge badge-${kind}`;
  statusBadge.textContent = text;
}

function setActionStatus(text, tone = "idle") {
  actionStatus.textContent = text;
  actionStatus.className = `action-status action-status-${tone}`;
}

function setPpStatus(text, tone = "idle") {
  ppSettingsStatus.textContent = text;
  ppSettingsStatus.className = `hint pp-settings-status-${tone}`;
}

function isErrorStatusMessage(message) {
  return /failed|error|required|cannot reach|ECONNREFUSED|refused|timeout|ETIMEDOUT|not configured|did not become reachable|not found|no items to write|cannot apply/i.test(
    message,
  );
}

function rigAuth() {
  return `Rig ${creds.rigId}:${creds.rigSecret}`;
}

async function apiFetch(path, init) {
  const base = (creds?.apiBaseUrl || API_BASE_DEFAULT).replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: rigAuth(),
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showPair() {
  pairScreen.classList.remove("hidden");
  mainScreen.classList.remove("hidden");
  hideUnpairConfirm();
  rigLabel.textContent = "Remote prep workstation · not paired as presentation rig";
  noBuild.classList.remove("hidden");
  noHandoff.classList.add("hidden");
  scanBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  renderBuild();
  setBadge("idle", "Remote prep");
  handoffCard.classList.add("hidden");
  noHandoff.classList.add("hidden");
  void loadPpSettings();
}

function showMain() {
  pairScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  rigLabel.textContent = `Presentation rig · ${creds.displayName} · ${creds.rigId.slice(0, 8)}…`;
  scanBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");
  setBadge("ready", "Rig paired");
  void loadPpSettings();
}

async function loadPpSettings() {
  try {
    const saved = await invoke("load_pp_settings");
    if (saved) {
      ppPort.value = String(saved.ppPort || "");
      ppTransport.value = saved.ppTransport || "tcp";
      if (ppBundleRoot) {
        ppBundleRoot.value = saved.ppBundleRoot || "";
      }
      setPpStatus(`Saved port ${saved.ppPort} (${saved.ppTransport}) on ${PP_HOST}.`, "ok");
    }
  } catch (e) {
    setPpStatus(
      e instanceof Error ? e.message : "Could not load ProPresenter settings.",
      "error",
    );
  }
}

function readPpSettingsFromForm() {
  const rawPort = ppPort.value.trim();
  const port = Number.parseInt(rawPort, 10);
  if (!rawPort || !Number.isFinite(port) || port < 1 || port > 65535) {
    return null;
  }
  return {
    ppHost: PP_HOST,
    ppPort: port,
    ppTransport: ppTransport.value || "tcp",
    ppBundleRoot: ppBundleRoot?.value?.trim() || null,
  };
}

function ppSettingsRequiredMessage() {
  return "Enter your TCP/IP Port ID (64509 on this Mac). ProPresenter → Settings → Network → Enable Network ON.";
}

function getPpSettingsOrExplain() {
  const settings = readPpSettingsFromForm();
  if (!settings) {
    setPpStatus(ppSettingsRequiredMessage(), "error");
    setActionStatus(ppSettingsRequiredMessage(), "error");
    return null;
  }
  return settings;
}

function setWorking(working) {
  busy = working;
  applyBtn.disabled = working;
  scanBtn.disabled = working;
  ppSaveBtn.disabled = working;
  if (remoteOpenBtn) remoteOpenBtn.disabled = working;
}

async function savePpSettings() {
  const settings = getPpSettingsOrExplain();
  if (!settings) return;

  setPpStatus("Saving…", "busy");
  try {
    await invoke("save_pp_settings", settings);
    setPpStatus(`Saved port ${settings.ppPort} (${settings.ppTransport}) on ${PP_HOST}.`, "ok");
  } catch (e) {
    setPpStatus(
      e instanceof Error ? e.message : "Could not save ProPresenter settings.",
      "error",
    );
  }
}

function formatSourceBadge(entry) {
  if (entry.sourceSubmissionId === "baseline") return "PCO baseline";
  if (entry.sourceSubmissionId === "direct") return "Direct send";
  const when = entry.sourceCreatedAt
    ? new Date(entry.sourceCreatedAt).toLocaleString()
    : "";
  const user = entry.sourceUserId?.slice(0, 8) ?? "planner";
  return `${user}… ${when}`.trim();
}

function cloneImplPlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

function applyRowSourceOverride(plan, elementKey, submissionId) {
  const row = plan.rows.find((r) => r.elementKey === elementKey);
  if (!row?.alternatives) return plan;
  const alt = row.alternatives.find((a) => a.submissionId === submissionId);
  if (!alt) return plan;
  const next = cloneImplPlan(plan);
  const target = next.rows.find((r) => r.elementKey === elementKey);
  if (!target) return plan;
  target.row = alt.row;
  target.sourceSubmissionId = alt.submissionId;
  target.sourceUserId = alt.sourceUserId;
  target.sourceCreatedAt = alt.sourceCreatedAt;
  target.autoSelected = false;
  if (alt.row.libraryMatch?.item?.id) {
    next.librarySelections[elementKey] = alt.row.libraryMatch.item.id;
  }
  return next;
}

function renderImplementationReview(plan) {
  if (!plan?.rows?.length) {
    implReview.classList.add("hidden");
    implReview.innerHTML = "";
    return;
  }

  implReview.classList.remove("hidden");
  const rows = plan.rows
    .map((entry) => {
      const conflict = entry.hadConflict && entry.alternatives?.length;
      const badge = formatSourceBadge(entry);
      if (!conflict) {
        return `<li class="impl-row"><span>${entry.row.name}</span><span class="impl-source">${badge}</span></li>`;
      }
      const options = [
        { submissionId: entry.sourceSubmissionId, label: `${entry.row.name} (auto)` },
        ...entry.alternatives.map((a) => ({
          submissionId: a.submissionId,
          label: `${a.row.name} (${a.sourceUserId.slice(0, 8)}…)`,
        })),
      ];
      const opts = options
        .map((o) => {
          const selected = o.submissionId === entry.sourceSubmissionId ? " selected" : "";
          return `<option value="${o.submissionId}"${selected}>${o.label}</option>`;
        })
        .join("");
      return `<li class="impl-row impl-row-conflict"><span>${entry.row.name}</span><select data-element-key="${entry.elementKey}" class="impl-source-select">${opts}</select></li>`;
    })
    .join("");

  implReview.innerHTML = `<p class="impl-title">Implementation plan (${plan.rows.length} rows)</p><ul class="impl-list">${rows}</ul>`;

  implReview.querySelectorAll(".impl-source-select").forEach((select) => {
    select.addEventListener("change", (e) => {
      const elementKey = e.target.getAttribute("data-element-key");
      const submissionId = e.target.value;
      if (!editedImplPlan || !elementKey) return;
      editedImplPlan = applyRowSourceOverride(editedImplPlan, elementKey, submissionId);
      renderImplementationReview(editedImplPlan);
    });
  });
}

function renderBuild() {
  if (pendingBuild) {
    buildCard.classList.remove("hidden");
    noBuild.classList.add("hidden");
    const isFailed = pendingBuild.status === "failed";
    buildTitle.textContent = isFailed ? "Apply failed — retry" : "Build ready";
    buildSummary.textContent =
      pendingBuild.change_summary || pendingBuild.plan_id || pendingBuild.id;

    if (isFailed && pendingBuild.error_message) {
      buildError.textContent = pendingBuild.error_message;
      buildError.classList.remove("hidden");
      const conflict = parsePlaylistConflictFromText(pendingBuild.error_message);
      if (conflict) showConflictCard({ ...conflict, message: pendingBuild.error_message });
      else hideConflictCard();
    } else {
      buildError.classList.add("hidden");
      buildError.textContent = "";
      if (!playlistConflict) hideConflictCard();
    }

    applyBtn.textContent = isFailed ? "Retry apply" : "Apply Slide Deck";

    editedImplPlan = pendingBuild.implementation_plan
      ? cloneImplPlan(pendingBuild.implementation_plan)
      : null;
    renderImplementationReview(editedImplPlan);

    changeDetail.textContent = JSON.stringify(
      {
        id: pendingBuild.id,
        status: pendingBuild.status,
        planId: pendingBuild.plan_id,
        summary: pendingBuild.change_summary,
        error: pendingBuild.error_message,
        mergeSummary: pendingBuild.implementation_plan?.mergeSummary,
      },
      null,
      2,
    );
    if (!busy) setBadge(isFailed ? "idle" : "ready", isFailed ? "Failed" : "Build ready");
  } else {
    buildCard.classList.add("hidden");
    noBuild.classList.remove("hidden");
    implReview.classList.add("hidden");
    buildError.classList.add("hidden");
    hideConflictCard();
    editedImplPlan = null;
    if (!busy) setBadge("ready", "Waiting");
  }
}

function handoffRecencyMs(h) {
  const mtime = h.playlist_file_mtime || h.updated_at || h.created_at;
  const t = Date.parse(mtime);
  return Number.isFinite(t) ? t : 0;
}

function sortHandoffsForRig(handoffs) {
  return [...handoffs].sort((a, b) => {
    const rank = (h) => {
      if (h.handoff_status === "complete" && h.admin_approved_for_rig && h.services_drive_url) {
        return 3;
      }
      if (h.handoff_status === "complete") return 2;
      if (h.handoff_status === "incomplete") return 1;
      return 0;
    };
    const byRank = rank(b) - rank(a);
    if (byRank !== 0) return byRank;
    return handoffRecencyMs(b) - handoffRecencyMs(a);
  });
}

function handoffOptionLabel(h) {
  const name =
    h.commit_plan?.playlistName ?? h.playlist_name ?? h.id.slice(0, 8);
  const version = h.version_label ? ` ${h.version_label}` : "";
  const status =
    h.handoff_status === "complete"
      ? h.admin_approved_for_rig
        ? "Complete (approved)"
        : "Complete"
      : "Incomplete";
  return `${status}${version} — ${name}`;
}

async function pollHandoffs() {
  if (!creds || busy) return;
  try {
    const data = await apiFetch(`/api/pp/rigs/${creds.rigId}/handoffs/pending`);
    const handoffs = data.handoffs ?? [];
    const eligible = handoffs.filter(
      (h) =>
        (h.handoff_status === "complete" && h.admin_approved_for_rig) ||
        h.handoff_status === "incomplete",
    );
    pendingHandoffs = sortHandoffsForRig(eligible);
    pendingHandoff = pendingHandoffs[0] ?? null;
    renderHandoff();

    if (
      pendingHandoff &&
      pendingHandoff.handoff_status === "complete" &&
      pendingHandoff.admin_approved_for_rig &&
      pendingHandoff.services_drive_url &&
      pendingHandoff.id !== lastAutoHandoffId &&
      !busy
    ) {
      lastAutoHandoffId = pendingHandoff.id;
      void importHandoff();
    }
  } catch {
    /* optional */
  }
}

function renderHandoff() {
  if (!handoffCard || !noHandoff) return;
  if (pendingHandoff) {
    handoffCard.classList.remove("hidden");
    noHandoff.classList.add("hidden");
    const isIncomplete = pendingHandoff.handoff_status === "incomplete";
    handoffTitle.textContent = isIncomplete
      ? "Incomplete handoff (import with caution)"
      : pendingHandoff.replace_on_rig
        ? "Complete handoff — replace requested"
        : "Complete handoff ready";
    const name =
      pendingHandoff.commit_plan?.playlistName ??
      pendingHandoff.playlist_name ??
      pendingHandoff.id;
    const version = pendingHandoff.version_label ? ` (${pendingHandoff.version_label})` : "";
    const replaceNote =
      pendingHandoff.replace_on_rig && !pendingHandoff.admin_approved_for_rig
        ? " Volunteer requested replace — confirm before overwriting."
        : "";
    handoffSummary.textContent = `${name}${version}.${isIncomplete ? " Missing elements may remain." : replaceNote}`;

    if (handoffPickerWrap && handoffPicker && pendingHandoffs.length > 1) {
      handoffPickerWrap.classList.remove("hidden");
      handoffPicker.innerHTML = "";
      for (const h of pendingHandoffs) {
        const opt = document.createElement("option");
        opt.value = h.id;
        opt.textContent = handoffOptionLabel(h);
        if (h.id === pendingHandoff.id) opt.selected = true;
        handoffPicker.appendChild(opt);
      }
    } else if (handoffPickerWrap) {
      handoffPickerWrap.classList.add("hidden");
    }
  } else {
    handoffCard.classList.add("hidden");
    noHandoff.classList.remove("hidden");
    if (handoffPickerWrap) handoffPickerWrap.classList.add("hidden");
  }
}

async function pollBuilds() {
  if (!creds || busy) return;
  try {
    const claimed = await apiFetch(
      `/api/pp/rigs/${creds.rigId}/builds/pending?list=1`,
    );
    const builds = claimed.builds ?? [];
    const ready =
      builds.find((b) => b.status === "failed") ??
      builds.find((b) => ["claimed", "applying"].includes(b.status));
    if (ready) {
      pendingBuild = ready;
    } else {
      const claim = await apiFetch(`/api/pp/rigs/${creds.rigId}/builds/pending`);
      pendingBuild = claim.build ?? null;
    }
    renderBuild();
  } catch (e) {
    setActionStatus(e instanceof Error ? e.message : "Poll failed", "error");
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  void pollBuilds();
  void pollHandoffs();
  pollTimer = setInterval(() => {
    void pollBuilds();
    void pollHandoffs();
  }, POLL_MS);
}

async function pair() {
  pairError.classList.add("hidden");
  const code = pairCode.value.trim().toUpperCase();
  const displayName = pairName.value.trim() || "Presentation rig";
  if (code.length < 6) {
    pairError.textContent = "Enter the 8-character pairing code.";
    pairError.classList.remove("hidden");
    return;
  }
  pairBtn.disabled = true;
  pairBtn.textContent = "Pairing…";
  try {
    const hostname = await invoke("get_hostname");
    const res = await fetch(`${API_BASE_DEFAULT}/api/pp/rigs/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        displayName,
        deviceFingerprint: hostname,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Pairing failed");
    }
    await invoke("save_credentials", {
      rigId: data.rigId,
      rigSecret: data.rigSecret,
      displayName: data.displayName,
      apiBaseUrl: data.apiBaseUrl || API_BASE_DEFAULT,
    });
    creds = {
      rigId: data.rigId,
      rigSecret: data.rigSecret,
      displayName: data.displayName,
      apiBaseUrl: data.apiBaseUrl || API_BASE_DEFAULT,
    };
    showMain();
    startPolling();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pairing failed";
    pairError.textContent =
      msg === "Load failed" || msg === "Failed to fetch"
        ? "Could not reach grapevineprep.com (network or blocked request). Check your connection and try again."
        : msg;
    pairError.classList.remove("hidden");
  } finally {
    pairBtn.disabled = false;
    pairBtn.textContent = "Pair as presentation rig";
  }
}

function openRemotePrepWorkspace() {
  window.open(`${API_BASE_DEFAULT}/slide-deck`, "_blank", "noopener,noreferrer");
  setActionStatus(
    "Opened Grapevine slide deck. Use Build in Grapevine Client on the web after Create Presentation.",
    "idle",
  );
}

function parseRemotePrepDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "grapevine:") return null;
    if (parsed.hostname !== "remote-prep") return null;
    const jobId = parsed.searchParams.get("jobId")?.trim();
    const token = parsed.searchParams.get("token")?.trim();
    if (!jobId || !token) return null;
    return { jobId, token };
  } catch {
    return null;
  }
}

async function runRemotePrep(jobId, token) {
  if (busy) {
    setActionStatus("Still working on the previous action…", "busy");
    return;
  }
  const ppSettings = getPpSettingsOrExplain();
  if (!ppSettings) return;

  setWorking(true);
  setBadge("busy", "Remote prep");
  setActionStatus("Pulling filebase, reconciling assets, and building playlist…", "busy");

  try {
    const output = await invoke("run_remote_prep", {
      jobId,
      clientToken: token,
      ppSettings,
    });
    setActionStatus(output || "Remote prep completed.", "ok");
    setBadge("ready", "Remote prep done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Remote prep failed";
    setActionStatus(msg, "error");
    setBadge("idle", "Remote prep failed");
  } finally {
    setWorking(false);
  }
}

function handleRemotePrepDeepLink(url) {
  const parsed = parseRemotePrepDeepLink(url);
  if (!parsed) return;
  void runRemotePrep(parsed.jobId, parsed.token);
}

async function applyBuild() {
  if (busy) {
    setActionStatus("Still working on the previous action…", "busy");
    return;
  }
  if (!pendingBuild) {
    setActionStatus("No build ready yet. Waiting for planner to send a deck…", "error");
    return;
  }

  const ppSettings = getPpSettingsOrExplain();
  if (!ppSettings) return;

  setWorking(true);
  setBadge("busy", "Applying");
  const priorLabel = applyBtn.textContent;
  applyBtn.textContent = "Applying…";
  setActionStatus(`Applying to ProPresenter on ${PP_HOST}:${ppSettings.ppPort}…`, "busy");
  hideConflictCard();

  try {
    if (pendingBuild.status === "failed") {
      await resetBuildForRetry(pendingBuild.id);
      renderBuild();
    }

    if (editedImplPlan && pendingBuild.implementation_plan) {
      const original = JSON.stringify(pendingBuild.implementation_plan);
      const edited = JSON.stringify(editedImplPlan);
      if (original !== edited) {
        await apiFetch(
          `/api/pp/rigs/${creds.rigId}/builds/${pendingBuild.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ implementationPlan: editedImplPlan }),
          },
        );
      }
    }

    const output = await invoke("run_apply", {
      buildId: pendingBuild.id,
      ppSettings,
    });
    setActionStatus(output || "Apply completed.", "ok");
    pendingBuild = null;
    renderBuild();
    void pollBuilds();
  } catch (e) {
    const conflict = parseConflictFromWorkerError(e);
    if (conflict) showConflictCard(conflict);
    const msg =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : "Apply failed";
    setActionStatus(
      conflict ? conflict.message ?? msg : msg || "Apply failed",
      "error",
    );
    void pollBuilds();
    renderBuild();
  } finally {
    setWorking(false);
    applyBtn.textContent = pendingBuild?.status === "failed" ? "Retry apply" : priorLabel;
    if (pendingBuild) {
      setBadge(pendingBuild.status === "failed" ? "idle" : "ready", pendingBuild.status === "failed" ? "Failed" : "Build ready");
    } else {
      setBadge("ready", "Paired");
    }
  }
}

async function conflictOverwrite() {
  if (!pendingBuild || !playlistConflict) return;
  hideConflictCard();
  await applyBuild();
}

function conflictView() {
  if (changeDetailsEl) {
    changeDetailsEl.open = true;
    changeDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function conflictDismiss() {
  hideConflictCard();
  setActionStatus("Conflict dismissed. Use Retry apply when ready.", "idle");
}

async function importHandoff() {
  if (busy || !pendingHandoff) return;
  const ppSettings = getPpSettingsOrExplain();
  if (!ppSettings) return;

  setWorking(true);
  setBadge("busy", "Importing");
  handoffImportBtn.textContent = "Importing…";
  setActionStatus("Downloading Services package and staging playlist…", "busy");

  try {
    const output = await invoke("run_handoff", {
      handoffId: pendingHandoff.id,
      ppSettings,
    });
    setActionStatus(output || "Handoff staged for ProPresenter import.", "ok");
    pendingHandoff = null;
    renderHandoff();
    void pollHandoffs();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Handoff import failed";
    setActionStatus(msg, "error");
  } finally {
    setWorking(false);
    handoffImportBtn.textContent = "Import handoff";
    setBadge("ready", pendingBuild ? "Build ready" : "Paired");
  }
}

async function skipHandoff() {
  if (!pendingHandoff || !creds) return;
  try {
    await apiFetch(`/api/pp/rigs/${creds.rigId}/handoffs/pending`, {
      method: "PATCH",
      body: JSON.stringify({ handoffId: pendingHandoff.id, status: "skipped" }),
    });
    pendingHandoff = null;
    renderHandoff();
    setActionStatus("Handoff skipped.", "idle");
  } catch (e) {
    setActionStatus(e instanceof Error ? e.message : "Skip failed", "error");
  }
}

async function scanNow() {
  if (busy) {
    setActionStatus("Still working on the previous action…", "busy");
    return;
  }

  const ppSettings = getPpSettingsOrExplain();
  if (!ppSettings) return;

  setWorking(true);
  setBadge("busy", "Scanning");
  scanBtn.textContent = "Scanning…";
  setActionStatus(`Scanning ProPresenter on ${PP_HOST}:${ppSettings.ppPort}…`, "busy");

  try {
    const output = await invoke("run_scan", { ppSettings });
    setActionStatus(output || "Index uploaded.", "ok");
  } catch (e) {
    const msg =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : "Scan failed";
    setActionStatus(msg || "Scan failed", "error");
  } finally {
    setWorking(false);
    scanBtn.textContent = "Scan now";
    setBadge("ready", pendingBuild ? "Build ready" : "Paired");
  }
}

function showUnpairConfirm() {
  unpairConfirm.classList.remove("hidden");
}

function hideUnpairConfirm() {
  unpairConfirm.classList.add("hidden");
}

async function unpair() {
  hideUnpairConfirm();
  setActionStatus("Removing pairing…", "busy");
  try {
    await invoke("clear_credentials");
    creds = null;
    pendingBuild = null;
    if (pollTimer) clearInterval(pollTimer);
    setActionStatus("Unpaired.", "ok");
    showPair();
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Unpair failed";
    setActionStatus(msg || "Unpair failed", "error");
  }
}

pairBtn.addEventListener("click", () => void pair());
if (remoteOpenBtn) {
  remoteOpenBtn.addEventListener("click", () => openRemotePrepWorkspace());
}
applyBtn.addEventListener("click", () => void applyBuild());
conflictOverwriteBtn.addEventListener("click", () => void conflictOverwrite());
conflictViewBtn.addEventListener("click", () => conflictView());
conflictDismissBtn.addEventListener("click", () => conflictDismiss());
scanBtn.addEventListener("click", () => void scanNow());
handoffImportBtn.addEventListener("click", () => void importHandoff());
handoffSkipBtn.addEventListener("click", () => void skipHandoff());
if (handoffPicker) {
  handoffPicker.addEventListener("change", () => {
    const next = pendingHandoffs.find((h) => h.id === handoffPicker.value);
    if (next) {
      pendingHandoff = next;
      renderHandoff();
    }
  });
}
settingsBtn.addEventListener("click", () => showUnpairConfirm());
unpairConfirmBtn.addEventListener("click", () => void unpair());
unpairCancelBtn.addEventListener("click", () => hideUnpairConfirm());
ppSaveBtn.addEventListener("click", () => void savePpSettings());

async function init() {
  try {
    const listen = window.__TAURI__?.event?.listen;
    if (listen) {
      await listen("remote-prep-status", (event) => {
        const message = typeof event.payload === "string" ? event.payload : String(event.payload ?? "");
        if (message) {
          const tone = isErrorStatusMessage(message) ? "error" : "ok";
          setActionStatus(message, tone);
          setBadge(tone === "ok" ? "ready" : "idle", tone === "ok" ? "Remote prep done" : "Remote prep");
        }
      });
    }
  } catch {
    /* optional */
  }
  try {
    const version = await invoke("app_version");
    const versionEl = document.getElementById("app-version");
    if (versionEl && version) versionEl.textContent = `v${version}`;
  } catch {
    /* optional */
  }
  try {
    const stored = await invoke("load_credentials");
    if (stored) {
      creds = stored;
      showMain();
      startPolling();
      return;
    }
  } catch {
    /* first launch */
  }
  showPair();
}

void init();
