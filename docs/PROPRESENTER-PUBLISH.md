# Slide deck — publish to Google Drive (remote upload)

Upload a **per-service package** from CPB to your personal Drive folders under `church-planning-buddy/ProPresenter/`.

| Drive folder | ID (your install) | Purpose |
|--------------|-------------------|---------|
| [Playlists](https://drive.google.com/drive/folders/1RGVufowmgGWnOXGRCTDTFKvVaJVRt_3v) | `PP_PLAYLISTS_FOLDER_ID` | Slide deck JSON + import marker for the church rig |
| [New Files](https://drive.google.com/drive/folders/1V0hCt2pzji3RCAqn-H6TjY149QLrJQYx) | `PP_NEW_FILES_FOLDER_ID` | New presentations/media the rig does not have yet |

Each publish creates (or updates) **`{YYYY.MM.DD-SUN}/`** under both parents, e.g. `2026.06.08-SUN/`.

## Package contents (`Playlists/{service}/`)

| File | Description |
|------|-------------|
| `manifest.json` | Service order + template plan |
| `build-report.json` | Warnings + playlist preview for operators |
| `commit-plan.json` | Full mock commit (operations + preview rows) |
| `import-marker.json` | Package ID, file hashes, links to New Files entries |

## Remote workflow (you)

1. Connect Google in CPB (same OAuth as GRG).
2. Open **Slide Deck** → select plan → **Build commit preview**.
3. Optional: **Apply to ProPresenter** on prep Mac.
4. **Publish to Drive** — uploads the package.

## CLI (headless)

```bash
npm run slide-deck:publish -- <planId> [--service-type-id=<id>] [--published-by=YourName]
```

Optional new asset for the rig:

```bash
npm run slide-deck:publish -- <planId> --new-file=./exports/NewSong.pro
```

Requires `.data/google-tokens.json` from an in-app Google connect.

## Environment

See `.env.local.example` — `PP_PLAYLISTS_FOLDER_ID` and `PP_NEW_FILES_FOLDER_ID` are set to your folder links.

## Church rig import

Import/sync on the Windows presentation rig is documented separately when you are on-site (`PROPRESENTER-RIG-MIGRATION.md` / launcher scripts — coming next).
