const invoke = window.__TAURI__?.core?.invoke;
if (!invoke) {
  throw new Error("Grapevine Rig must run inside the Tauri app.");
}

const API_BASE_DEFAULT = "https://grapevineprep.com";
const POLL_MS = 5000;

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

let creds = null;
let pendingBuild = null;
let pollTimer = null;
let busy = false;

function setBadge(kind, text) {
  statusBadge.className = `badge badge-${kind}`;
  statusBadge.textContent = text;
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
    setBadge("ready", "Build ready");
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
    actionStatus.textContent = e instanceof Error ? e.message : "Poll failed";
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
  }
}

async function applyBuild() {
  if (!pendingBuild || busy) return;
  busy = true;
  applyBtn.disabled = true;
  scanBtn.disabled = true;
  setBadge("busy", "Applying");
  actionStatus.textContent = "Applying to ProPresenter…";
  try {
    const output = await invoke("run_apply", { buildId: pendingBuild.id });
    actionStatus.textContent = output || "Apply completed.";
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
    actionStatus.textContent = msg || "Apply failed";
  } finally {
    busy = false;
    applyBtn.disabled = false;
    scanBtn.disabled = false;
    setBadge("ready", "Paired");
  }
}

async function scanNow() {
  if (busy) return;
  busy = true;
  scanBtn.disabled = true;
  applyBtn.disabled = true;
  setBadge("busy", "Scanning");
  actionStatus.textContent = "Scanning ProPresenter library…";
  try {
    const output = await invoke("run_scan");
    actionStatus.textContent = output || "Index uploaded.";
  } catch (e) {
    const msg =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : "Scan failed";
    actionStatus.textContent = msg || "Scan failed";
  } finally {
    busy = false;
    scanBtn.disabled = false;
    applyBtn.disabled = false;
    setBadge("ready", "Paired");
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
