const invoke = window.__TAURI__?.core?.invoke;
if (!invoke) {
  throw new Error("Grapevine Rig must run inside the Tauri app.");
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
const buildSummary = $("build-summary");
const changeDetail = $("change-detail");
const noBuild = $("no-build");
const applyBtn = $("apply-btn");
const scanBtn = $("scan-btn");
const settingsBtn = $("settings-btn");
const actionStatus = $("action-status");
const ppPort = $("pp-port");
const ppTransport = $("pp-transport");
const ppSaveBtn = $("pp-save-btn");
const ppSettingsStatus = $("pp-settings-status");

let creds = null;
let pendingBuild = null;
let pollTimer = null;
let busy = false;

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
  mainScreen.classList.add("hidden");
  setBadge("idle", "Not paired");
}

function showMain() {
  pairScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  rigLabel.textContent = `${creds.displayName} · ${creds.rigId.slice(0, 8)}…`;
  setBadge("ready", "Paired");
  void loadPpSettings();
}

async function loadPpSettings() {
  try {
    const saved = await invoke("load_pp_settings");
    if (saved) {
      ppPort.value = String(saved.ppPort || "");
      ppTransport.value = saved.ppTransport || "tcp";
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

function renderBuild() {
  if (pendingBuild) {
    buildCard.classList.remove("hidden");
    noBuild.classList.add("hidden");
    buildSummary.textContent =
      pendingBuild.change_summary || pendingBuild.plan_id || pendingBuild.id;
    changeDetail.textContent = JSON.stringify(
      {
        id: pendingBuild.id,
        status: pendingBuild.status,
        planId: pendingBuild.plan_id,
        summary: pendingBuild.change_summary,
      },
      null,
      2,
    );
    if (!busy) setBadge("ready", "Build ready");
  } else {
    buildCard.classList.add("hidden");
    noBuild.classList.remove("hidden");
    if (!busy) setBadge("ready", "Waiting");
  }
}

async function pollBuilds() {
  if (!creds || busy) return;
  try {
    const claimed = await apiFetch(
      `/api/pp/rigs/${creds.rigId}/builds/pending?list=1`,
    );
    const builds = claimed.builds ?? [];
    const ready = builds.find((b) =>
      ["claimed", "applying"].includes(b.status),
    );
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
  pollTimer = setInterval(() => void pollBuilds(), POLL_MS);
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
    pairBtn.textContent = "Pair this Mac";
  }
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
  applyBtn.textContent = "Applying…";
  setActionStatus(`Applying to ProPresenter on ${PP_HOST}:${ppSettings.ppPort}…`, "busy");

  try {
    const output = await invoke("run_apply", {
      buildId: pendingBuild.id,
      ppSettings,
    });
    setActionStatus(output || "Apply completed.", "ok");
    pendingBuild = null;
    renderBuild();
    void pollBuilds();
  } catch (e) {
    const msg =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : "Apply failed";
    setActionStatus(msg || "Apply failed", "error");
  } finally {
    setWorking(false);
    applyBtn.textContent = "Apply Slide Deck";
    if (pendingBuild) setBadge("ready", "Build ready");
    else setBadge("ready", "Paired");
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

async function unpair() {
  if (!confirm("Remove pairing credentials from this Mac?")) return;
  await invoke("clear_credentials");
  creds = null;
  pendingBuild = null;
  if (pollTimer) clearInterval(pollTimer);
  showPair();
}

pairBtn.addEventListener("click", () => void pair());
applyBtn.addEventListener("click", () => void applyBuild());
scanBtn.addEventListener("click", () => void scanNow());
settingsBtn.addEventListener("click", () => void unpair());
ppSaveBtn.addEventListener("click", () => void savePpSettings());

async function init() {
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
