# Install Grapevine Rig (macOS)

Grapevine Rig is the presentation-Mac app that applies slide decks to ProPresenter and uploads your library index to grapevineprep.com. **You** download and install it — the agent does not run install steps on your machine.

## Prerequisites

- macOS on the presentation computer (pilot: your Mac; later: sanctuary rig)
- ProPresenter installed with **Network** enabled
- Org **admin** access on [grapevineprep.com](https://grapevineprep.com) to generate a pairing code
- Cloud Phase 1 deployed (`npm run deploy:cf`) and migration `20260609120000_rig_pairing.sql` applied in Supabase

## 1. Download

1. Open the project **GitHub Releases** page.
2. Find the latest release tagged `grapevine-rig-v*` (use **v0.1.7+** for Intel and Apple Silicon Macs).
3. Download **`Grapevine-Rig-*-macos.dmg`**.

Releases are built by the `grapevine-rig-release` workflow when a matching tag is pushed. Builds from **v0.1.7** onward are **universal** (Intel + Apple Silicon). Older releases (e.g. v0.1.6) are Apple Silicon only and show a **prohibited** icon on Intel Macs.

## 2. Install

1. Open the `.dmg`.
2. Drag **Grapevine Rig** to **Applications**.
3. First launch: if macOS blocks the app (unsigned pilot build), **right-click → Open** once, or allow in **System Settings → Privacy & Security**.

## 3. Pair with your church org

1. On grapevineprep.com, sign in as org admin.
2. Go to **Slide deck** → **Presentation rigs (admin)** → **Add presentation rig**.
3. Copy the **8-character code** (expires in 15 minutes).
4. Open **Grapevine Rig** on the presentation Mac.
5. Enter the code and a display name (e.g. `Pilot rig` or `Sanctuary Mac`).
6. Click **Pair this Mac**.

Credentials are stored in the **macOS Keychain** (service `com.grapevineprep.rig`).

## 4. ProPresenter setup

1. Open ProPresenter on this Mac.
2. **ProPresenter → Settings → Network** → turn **Enable Network** ON.
3. Note the **TCP/IP Port ID** (example: `64509` — yours may differ; it is often **not** `50001`).
4. In **Grapevine Rig**, expand **ProPresenter settings**, enter that port, set transport to **TCP** (recommended for ProPresenter 21+), and click **Save ProPresenter settings**.
5. Click **Scan now** to upload the library index (replaces `npm run pp:index-upload`).

If Apply or Scan cannot reach ProPresenter, confirm ProPresenter is running, Network is ON, and the saved port matches the TCP/IP Port ID. Toggle Network off and on if the port refuses connections.

**Dev checkout:** from the repo root, `npm run pp:diagnose` tests ports using `.env.local` (`PP_PORT`, `PP_TRANSPORT=tcp`).

## 5. Weekly workflow

| Who | Action |
|-----|--------|
| Planner | grapevineprep.com → Slide deck → preview → **Send to presentation rig** |
| Rig operator | Grapevine Rig shows **Build ready** → **Apply Slide Deck** (ProPresenter open) |
| Planner | **Refresh status** on the website → `Completed` + Drive link if publish succeeded |

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
| Preview songs not found | Run **Scan now** in Grapevine Rig |
| Gatekeeper blocks app | Right-click → Open, or use a signed release when Apple ID secrets are configured in CI |
| Old bootstrap rig | You may have a rig from `pp:index-upload`; pairing creates a new rig row — revoke the old one in admin if duplicate |

## 7. Unpair

In Grapevine Rig → **Unpair** removes Keychain credentials. Generate a new pairing code to link again.

## Dev / repo checkout (not for operators)

```bash
cd church-planning-buddy
npm run rig:prepare
cd apps/grapevine-rig && npm install && npm run tauri dev
```

Requires Node 20+, Rust, and Xcode command-line tools. Apply uses bundled worker scripts in release builds (`worker.mjs` via login-shell Node); dev falls back to `node` + `apps/grapevine-rig-worker/dist/*.mjs`.

## Windows (later)

After the Mac pilot, a Windows `.msi` / `.exe` will follow the same pairing and Apply flow. See `docs/planning/SLIDE-DECK-PHASE-1-SPEC.md`.
