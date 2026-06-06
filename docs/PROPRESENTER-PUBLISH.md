# Slide deck — publish to Google Drive (remote upload)

Upload a **per-service package** from CPB to your personal Drive folders under `church-planning-buddy/ProPresenter/`.

| Drive folder | ID (your install) | Purpose |
|--------------|-------------------|---------|
| [Playlists](https://drive.google.com/drive/folders/1RGVufowmgGWnOXGRCTDTFKvVaJVRt_3v) | `PP_PLAYLISTS_FOLDER_ID` | Native ProPresenter playlist export for the church rig |
| [New Files](https://drive.google.com/drive/folders/1V0hCt2pzji3RCAqn-H6TjY149QLrJQYx) | `PP_NEW_FILES_FOLDER_ID` | New presentations/media the rig does not have yet |

Each publish creates (or updates) **`{YYYY.MM.DD-SUN}/`** under both parents, e.g. `2026.06.08-SUN/`.

## Package contents (`Playlists/{service}/`)

| File | Description |
|------|-------------|
| `{service}-{playlist}.zip` | Transport archive (system `zip`) containing the native `.proplaylist` |
| `{playlist}.proplaylist` | Same file as inside the zip — use this for import without unzipping the transport zip |

Publish uses **ProPresenter → File → Export → Playlist** (automated on macOS during Publish). CPB does **not** copy internal `Playlists/Library`-style documents from Support Files.

## Remote workflow (prep Mac)

1. Connect Google in CPB (same OAuth as GRG).
2. Open **Slide Deck** → select plan → **Build commit preview**.
3. **Apply to ProPresenter** (or confirm the service playlist already exists).
4. **Publish to Drive** — ProPresenter must be **running and frontmost** while export runs (~30–120s).

Optional: export manually first (**File → Export → Playlist**), then publish with `nativeExportPath` (API/CLI) if automation fails.

## Hosted site (grapevineprep.com)

The cloud Worker cannot reach ProPresenter or run AppleScript. On the hosted Slide Deck page:

- **Preview** works (PCO order; library match degraded without PP).
- **Send to Mac agent** — queue apply + publish; run `npm run slide-deck:agent` on the prep Mac (see `docs/SLIDE-DECK-AGENT.md`).
- **CLI** — `npm run slide-deck:apply` / `slide-deck:publish` on the Mac with `.env.local`.
- **Upload publish** — export `.proplaylist` on the Mac, upload in the browser, then **Publish to Drive**.

See `docs/HOSTING-GRAPEVINE.md` (Slide Deck section).

## Rig import

1. Download **`{playlist}.proplaylist`** from Drive (or unzip the transport `.zip` once).
2. In ProPresenter: **File → Import** → select the `.proplaylist`.
3. Do **not** unzip the `.proplaylist` in Finder (it is not a normal zip on PP 21.x).

### Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| **error unzipping files** | Wrong file (e.g. internal library document renamed to `.proplaylist`). Re-publish after this fix. |
| Export timeout | ProPresenter not frontmost, or save dialog blocked. Export manually and use `nativeExportPath`. |

## CLI (headless)

```bash
npm run slide-deck:publish -- <planId> [--service-type-id=<id>] [--published-by=Name]
```

Manual export fallback (after you save `MyService.proplaylist`):

```bash
# Pass path via API body nativeExportPath from a custom script, or extend slide-deck-publish.ts
```

Requires `.data/google-tokens.json` from an in-app Google connect.

## Environment

See `.env.local.example`:

- `PP_EXPORT_STAGING_DIR` — optional; defaults to `.data/pp-exports/`
- `PP_SUPPORT_FILES_PATH` — not used for publish handoff (sync/diff only)

## JSON instruction package (tabled)

Code for `manifest.json`, `build-report.json`, `commit-plan.json`, and `import-marker.json` remains in `src/lib/slide-deck/publish-instructions.ts` for a future rig automation path.

## Church rig import

Import/sync on the Windows presentation rig is documented separately when you are on-site (`PROPRESENTER-RIG-MIGRATION.md` / launcher scripts — coming next).
