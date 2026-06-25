# Case: Grapevine Rig Windows Scan — EISDIR `lstat 'C:'`

**Status:** Concluded (fix ready: v0.2.13)  
**Date:** 2026-06-25  
**Slug:** grapevine-rig-windows-scan-eisdir

## Hand-off Brief

Scan now on the Envy fails because Node is launched with a broken entrypoint (`argv[1]` becomes `C:`), not because scan logic or Drive/index is wrong. v0.2.8–v0.2.12 addressed Tauri `cmd /C` and then `std::process::Command`, but `windows_node_executable()` can still resolve **`npm node.cmd`** when the GUI app’s PATH omits `Program Files\nodejs`. v0.2.13 must resolve **only `node.exe`** from standard install dirs + `where node.exe`, never `.cmd`/`.bat`.

---

## Problem Statement

On Windows Envy, Grapevine Rig **v0.2.10 / v0.2.12** footer, **Scan now** returns:

```
Error: EISDIR: illegal operation on a directory, lstat 'C:'
  at Object.realpathSync (node:fs:2745:25)
  at Module._findPath ... resolveMainPath ... run_main_module
Node.js v24.16.0
```

User expectation: Scan uploads `pp_index_snapshots` so grapevineprep.com can match songs and Pull can proceed.

---

## Evidence Inventory

| Source | Status | Notes |
|--------|--------|-------|
| User stack trace | **Confirmed** | `resolveMainPath` / `run_main` — Node startup, not scan.mjs `main()` |
| `lib.rs` pre-v0.2.8 | **Confirmed** | `cmd /C node` + unquoted `C:\` script — commit `573d99a` |
| `lib.rs` v0.2.12 | **Confirmed** | `std::process::Command::new(&node).arg(&script)` — commit `2c7b789` |
| User footer v0.2.12 | **Confirmed** | User report |
| Envy `scan.mjs` path | **Confirmed** | `C:\Users\Saddleback\AppData\Local\Grapevine Rig\resources\scan.mjs` |
| GUI vs shell PATH on Envy | **Missing** | Would confirm `where node` → `node.cmd` |
| Manual `node.exe` + scan.mjs on Envy | **Missing** | Gold control test |

---

## Timeline

| When | Event |
|------|-------|
| ≤ v0.2.7 | Windows spawn: `cmd /C node` + script path → `C:` split |
| v0.2.8 | Direct `node.exe` via Tauri shell — same class of bug via shell |
| v0.2.10 | Tauri shell + forward slashes — still shell layer |
| v0.2.11 | CI failed (Rust `??`) — never shipped |
| v0.2.12 | `std::process::Command` shipped — user still sees identical `C:` error |
| 2026-06-25 | Investigation: `where node` fallback can select `.cmd` shim |

---

## Hypotheses

### H1 — Tauri `cmd /C node` (v0.2.7)

**Status:** Confirmed for v0.2.7  
**Resolution:** Fixed in a3ea865; user on v0.2.12 so not current sole cause.

### H2 — Tauri shell still used on v0.2.12

**Status:** Refuted  
**Evidence:** `run_node_worker_stdout` returns early to `run_windows_node_worker` on `target_os = "windows"` (`lib.rs:579-581`). No `cmd /C` remains in Windows rig code.

### H3 — `npm node.cmd` resolved when `node.exe` not on GUI PATH

**Status:** Confirmed (code + mechanism)  
**Chain:**
1. GUI apps inherit shortened PATH (often omits `C:\Program Files\nodejs\`).
2. `windows_node_executable()` tries `where node.exe`, then `where node` (`lib.rs:403-417`).
3. `where node` commonly returns `...\AppData\Roaming\npm\node.cmd` first.
4. `Command::new("...node.cmd").arg("C:\...\scan.mjs")` routes through cmd batch parsing → `C:` passed as Node’s main module → identical stack trace.
5. Matches persistence across v0.2.8–v0.2.12 despite spawn refactors.

**Refutation attempt:** v0.2.12 uses native Command — refuted for *Tauri* but not for *cmd shim*.

### H4 — scan.mjs internal spawn

**Status:** Refuted  
**Evidence:** `scan.mjs` has no `child_process` at top level; error is in `run_main` before user `main()`.

### H5 — Wrong installer / old binary

**Status:** Refuted  
**Evidence:** Footer `v0.2.12` is compile-time `CARGO_PKG_VERSION`; CI published matching tag.

---

## Source Code Trace

| Item | Location |
|------|----------|
| Scan entry | `frontend/main.js` → `invoke("run_scan")` |
| Tauri command | `lib.rs:716-717` `run_scan` → `run_node_worker` |
| Windows branch | `lib.rs:579-581` → `run_windows_node_worker` |
| Node resolution | `lib.rs:390-421` `windows_node_executable` |
| Script resolution | `lib.rs:359-373` `resolve_worker_script` → Resource `scan.mjs` |
| Upload target | `scan.mjs` → `POST /api/pp/rigs/{rigId}/snapshots` |

---

## Final Conclusion

**Confidence: Medium-High**

The error is **Node failing to start** because the **executable or argument vector** still passes `C:` as the script path. v0.2.12 removed Tauri shell but **`windows_node_executable()` may select `node.cmd`**, reproducing the classic Windows `C:\` argument-split bug. Fix: resolve **only `node.exe`** from standard install locations and `where node.exe`; reject `.cmd`/`.bat`; surface resolved paths in error messages.

---

## Fix Direction (v0.2.13)

1. `windows_node_executable`: Program Files paths, `%LOCALAPPDATA%\Programs\node\node.exe`, `where node.exe` only, reject non-exe.
2. On spawn failure, include `node=` and `script=` in error text.
3. Tag `grapevine-rig-v0.2.13`, install on Envy from GitHub Release.

---

## Steps to Success (full workflow after Scan)

### A. Unblock Scan (Envy)

1. Install **Grapevine-Rig-0.2.13-windows-setup.exe** from GitHub Release.
2. Footer **v0.2.13**; PP library folder set; **Scan now** → “Index uploaded …”.
3. Refresh grapevineprep.com — banner **SBB Presentation Computer**, today’s date.

### B. Drive filebase (for Pull)

1. Owner **Connect Google** on grapevineprep.com.
2. Confirm Shared Drive `Filebase/Libraries/` has content (M2 seed if empty).
3. Web: Create → disambiguate → **Pull filebase files** → zip.

### C. Volunteer prep

1. Unzip pull into `Documents\ProPresenter\`.
2. Grapevine Prep or web handoff flow for Download → edit → upload.

### D. Sunday rig

1. Admin sign-off on complete handoff.
2. Envy rig import handoff.

### Control test (if v0.2.13 still fails)

```powershell
$env:RIG_ID="9291796e-..."
$env:RIG_SECRET="..."
$env:PP_BUNDLE_ROOT="C:\Users\Saddleback\Documents\ProPresenter"
& "C:\Program Files\nodejs\node.exe" "C:\Users\Saddleback\AppData\Local\Grapevine Rig\resources\scan.mjs"
```

If this works but Scan now fails → rig resolution still wrong. If this fails same error → env or script path issue on Envy.

---

## Next actions

- `bmad-quick-dev` / Agent: ship v0.2.13 node.exe resolution fix.
- Operator: install v0.2.13, run Scan, then M2/Pull checklist above.
