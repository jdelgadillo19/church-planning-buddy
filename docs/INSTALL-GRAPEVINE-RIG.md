# Install Grapevine Rig (macOS and Windows)

Grapevine Rig is the presentation-rig app that applies slide decks to ProPresenter and uploads your library index to grapevineprep.com. **You** download and install it — the agent does not run install steps on your machine.

## Prerequisites

- **macOS** or **Windows** on the presentation computer
- ProPresenter installed with **Network** enabled
- Org **admin** access on [grapevineprep.com](https://grapevineprep.com) to generate a pairing code
- Cloud Phase 1 deployed and migrations through `20260609140000_slide_deck_submissions.sql` applied in Supabase

## 1. Download

**Permanent links** (always the latest build — bookmark these):

| Platform | URL |
|----------|-----|
| macOS | https://grapevineprep.com/downloads/grapevine-rig-macos.dmg |
| Windows | https://grapevineprep.com/downloads/grapevine-rig-windows-setup.exe |

Also on the [grapevineprep.com login page](https://grapevineprep.com/login) under **Presentation rig**.

**Archive:** versioned builds remain on the project [GitHub Releases](https://github.com/jdelgadillo19/church-planning-buddy/releases) (`grapevine-rig-v*` tags).

Mac builds from **v0.1.7** onward are **universal** (Intel + Apple Silicon).

## 2. Install

### macOS

1. Open the `.dmg`.
2. Drag **Grapevine Rig** to **Applications**.
3. First launch: if macOS blocks the app (unsigned pilot build), **right-click → Open** once, or allow in **System Settings → Privacy & Security**.

### Windows

1. Run **`Grapevine-Rig-*-windows-setup.exe`** (use **v0.2.7+** for Windows Credential Manager pairing).
2. Launch **Grapevine Rig** from the Start menu.
3. Ensure **Node.js 20+** is installed and on `PATH` (required for apply/scan workers).
4. Drive publish via AppleScript export is **not** available on Windows — apply still succeeds; publish is skipped.

**HP Envy TE01:** run `scripts/envy-rig-setup.ps1` in PowerShell (checks Node, downloads installer, prints pairing steps).

## 3. Pair with your church org

1. On grapevineprep.com, sign in as org admin.
2. Go to **Slide deck** → **Presentation rigs (admin)** → **Add presentation rig**.
3. Copy the **8-character code** (expires in 15 minutes).
4. Open **Grapevine Rig** on the presentation computer (Mac or Windows).
5. Enter the code and a display name (e.g. `Pilot rig` or `Sanctuary Windows`).
6. Click **Pair this rig**.

Credentials are stored in the **macOS Keychain** or **Windows Credential Manager** (service `com.grapevineprep.rig`).

## 4. ProPresenter setup

1. Open ProPresenter on this computer.
2. **ProPresenter → Settings → Network** → turn **Enable Network** ON.
3. Note the **TCP/IP Port ID** (example: `64509` — yours may differ; it is often **not** `50001`).
4. In **Grapevine Rig**, expand **ProPresenter settings**, enter that port, set transport to **TCP** (recommended for ProPresenter 21+), and click **Save ProPresenter settings**.
5. Click **Scan now** to upload the library index (replaces `npm run pp:index-upload`).

If Apply or Scan cannot reach ProPresenter, confirm ProPresenter is running, Network is ON, and the saved port matches the TCP/IP Port ID. Toggle Network off and on if the port refuses connections.

**Dev checkout:** from the repo root, `npm run pp:diagnose` tests ports using `.env.local` (`PP_PORT`, `PP_TRANSPORT=tcp`).

## 5. Weekly workflow

| Who | Action |
|-----|--------|
| Planner | grapevineprep.com → Slide deck → preview → **Submit draft** (optional, for multi-planner merge) → **Send to presentation rig** |
| Rig operator | Grapevine Rig shows **Build ready** → review **Implementation plan** row sources (override conflicts if needed) → **Apply Slide Deck** (ProPresenter open) |
| Planner | **Refresh status** on the website → `Completed` + Drive link if publish succeeded |

**Submitted vs implementation plan:** planners submit row-level drafts; Send merges them into an **implementation plan** stored on the build. The rig applies the implementation plan (overwrite when replanning), not raw per-user drafts.

Build statuses on the website: **Pending** → **Claimed** → **Applying** → **Completed** / **Failed**.

## 6. Troubleshooting

| Issue | What to try |
|-------|-------------|
| App icon shows **prohibited** (circle with line) in Finder | You likely have an **Intel Mac** and downloaded **v0.1.6 or earlier** (Apple Silicon only). Use **v0.1.7+** universal build from Releases. |
| Pairing code invalid | Generate a new code; codes expire in 15 minutes and are single-use |
| Apply fails | Confirm ProPresenter is running, Network on, port saved in **ProPresenter settings** (TCP transport for PP 21+). Dev: `npm run pp:diagnose` |
| PCO auth error after apply | Fixed in **v0.2.1+** — publish uses stored commit plan, not local PCO tokens. |
| Google CLIENT_ID error after apply | Fixed in **v0.2.2+** — OAuth credentials come from Grapevine Prep run-context. |
| `mkdir '/.data'` during publish | Fixed in **v0.2.3+** — export staging uses app data folder; AppleScript bundled in app. |
| Build shows Drive publish skipped | Apply still succeeds — playlist is in ProPresenter. Drive upload is optional; enable **Grapevine Rig** under **System Settings → Privacy & Security → Accessibility** if you want automatic Drive publish. |
| Preview songs not found | Add song in ProPresenter → **Scan now** in Grapevine Rig → refresh preview on grapevineprep.com. Send/Submit is blocked until library match. See `docs/planning/new-song-entry-workflow.md`. |
| Apply failed — build disappeared | Fixed in **v0.2.6+** — failed builds stay on rig with **Retry apply** and error details. |
| "Playlist already exists" with no Overwrite button | Fixed in **v0.2.6+** — rig overwrites Sunday playlist on apply; conflict card offers **Overwrite** / **View** / **Dismiss**. |
| Verify timeout with shifted song positions | Fixed in **v0.2.6+** — missing library songs fail before apply instead of partial write + 30s mismatch. |
| Pairing doesn’t stick after restart (Windows) | Use **v0.2.7+** (Windows Credential Manager via `keyring` `windows-native`). Re-pair after upgrade. |
| Old bootstrap rig | You may have a rig from `pp:index-upload`; pairing creates a new rig row — revoke the old one in admin if duplicate |

## 7. Unpair

In Grapevine Rig → **Unpair** removes Keychain credentials. Generate a new pairing code to link again.

## 8. Presentation rig vs remote prep

| Device | Grapevine Rig? | Scan now? | Send → Apply? |
|--------|----------------|-----------|---------------|
| **Sanctuary presentation rig** (HP Envy TE01) | Yes — pair once | Yes | Receives builds from browser |
| **Volunteer prep laptop** (local ProPresenter) | **No** | No | No — **Download** builds into local PP; upload handoff; not sanctuary apply |
| **Browser planner** (grapevineprep.com) | No | No | Queues Send to rig |

Only one active **presentation rig** per org. Do not pair Grapevine Rig on prep machines.

## Ops checklist (before first Sunday)

1. Apply Supabase migration `20260616120000_pp_rigs_rig_kind.sql` and `20260616130000_pp_rigs_deduplicate_presentation.sql`, **or** paste [`scripts/sql/pp-rigs-migration-fix.sql`](../../scripts/sql/pp-rigs-migration-fix.sql) in the Supabase SQL Editor (idempotent). If the unique index failed before, revoke duplicate rigs first — only **SBB Presentation Computer** (newest) should stay `active`.
2. **Revoke** any bootstrap or dev `pp_rigs` rows in Supabase (or admin UI) except the sanctuary machine.
3. Install **Grapevine Rig v0.2.7+** and **Node 20+** on the HP Envy presentation rig only.
4. Pair the HP Envy as the org presentation rig (Slide deck → Register sanctuary presentation rig).
5. Configure ProPresenter TCP port in Grapevine Rig → **Scan now**.
6. On grapevineprep.com: Create Presentation → **Send to presentation rig** → on rig, **Apply Slide Deck**.
7. Zip a ProPresenter filebase backup; pause/uninstall `sbblegacytech@gmail` bidirectional GDrive sync on the rig.
8. Confirm planners use the church Shared drive layout — not personal sync accounts for writes.
9. **Remote prep (interim):** volunteers with local ProPresenter run slide deck on their machine (`PP_ALLOW_WRITES=true`) → Create Presentation → **Download presentation** → edit → upload. Automated Filebase pull (M4) waits until M2 seed.

## Dev / repo checkout (not for operators)

```bash
cd church-planning-buddy
npm run rig:prepare
cd apps/grapevine-rig && npm install && npm run tauri dev
```

Requires Node 20+, Rust, and Xcode command-line tools (macOS) or Visual Studio Build Tools (Windows). Apply uses bundled worker scripts in release builds (`worker.mjs` via login-shell Node); dev falls back to `node` + `apps/grapevine-rig-worker/dist/*.mjs`.
