# HP Envy TE01 — Phase 1 operator checklist

Run on the **presentation rig** after dev has shipped **Grapevine Rig v0.2.7+**.

---

## A. One-command setup (recommended)

1. Copy `scripts/envy-rig-setup.ps1` to the Envy (or clone repo).
2. Open **PowerShell** as the rig operator user.
3. Run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\envy-rig-setup.ps1
   ```

The script checks Node, downloads `Grapevine-Rig-0.2.7-windows-setup.exe`, runs the installer, and prints pairing steps.

**If Node is missing:** install [Node.js 20 LTS](https://nodejs.org), reopen PowerShell, verify `node -v`, re-run the script.

---

## B. Pair and configure ProPresenter

| Step | Action | Pass |
|------|--------|------|
| B1 | grapevineprep.com → sign in as org admin (`jesse@saddleback.de`) | Hub loads |
| B2 | Slide deck → Presentation rigs (admin) → **Add presentation rig** | 8-char code shown |
| B3 | Grapevine Rig → enter code + name `HP Envy TE01` → **Pair** | Rig name appears |
| B4 | ProPresenter → Settings → Network → **Enable Network** ON | Port visible |
| B5 | Grapevine Rig → ProPresenter settings → port + **TCP** → **Save** | Saved OK |
| B6 | Grapevine Rig → **Scan now** | Success message |
| B7 | Web → Slide deck → confirm library index freshness | Timestamp + rig name |

---

## C. Smoke test — Send → Apply

| Step | Actor | Action | Pass |
|------|-------|--------|------|
| C1 | Planner | Load PCO plan → preview → fix missing songs | Preview OK |
| C2 | Rig | **Scan now** if library changed since B6 | — |
| C3 | Planner | **Send to presentation rig** | Build queued |
| C4 | Rig | **Build ready** → review plan → **Apply Slide Deck** (PP open) | Apply succeeds |
| C5 | Planner | **Refresh status** | `Completed` |
| C6 | Rig | ProPresenter shows Sunday playlist | Visible in PP |

**Expected on Windows:** Drive publish link may be absent — apply success is the gate.

**If apply fails:** use **Retry apply** on rig (v0.2.6+); check Node on PATH and ProPresenter port.

---

## E. Remote prep handoff lane

| Step | Actor | Action | Pass |
|------|-------|--------|------|
| E1 | Prep laptop | grapevineprep.com → weekend → **Create Presentation** | Preview OK |
| E2 | Prep laptop | **Pull filebase files** (if M2 seeded) or manual library copy | Zip or local files |
| E3 | Prep laptop | Local dev `PP_ALLOW_WRITES=true` → **Download presentation** | Playlist in PP |
| E4 | Prep laptop | Edit playlist → **Open upload tool** → **Upload complete** | Handoff row in Supabase |
| E5 | Planner | Web shows complete handoff in weekend list | Green banner |
| E6 | Rig | **Import handoff** in Grapevine Rig | Staged `.proplaylist` path shown |
| E7 | Rig operator | ProPresenter → File → Import → Playlist | Playlist visible |

Set `GV_DRIVE_LAYOUT=dual` or `v1` and `PP_SERVICES_FOLDER_ID` for automatic Services/ publish on complete upload.

---

## D. Credential persistence check (v0.2.7)

1. Close Grapevine Rig completely.
2. Reopen Grapevine Rig.
3. Confirm rig stays **paired** (no re-pair prompt).

If pairing is lost, confirm installer is **v0.2.7+** and check Windows Credential Manager for `com.grapevineprep.rig`.

---

## Next: Phase 2

See [envy-filebase-migration-runbook.md](./envy-filebase-migration-runbook.md) for gtemp account → Shared drive migration.
