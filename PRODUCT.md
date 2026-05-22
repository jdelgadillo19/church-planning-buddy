# Church Planning Buddy — MVP product spec

**Status:** Approved from `MVP-OPEN-QUESTIONS.md` (2026-05-22)  
**Reference plan:** `87788328`  
**Reference output:** `Get Ready Guide (SUN).docx` (redacted names; otherwise golden)  
**MVP edit target:** `Get Ready Guide (Good Friday)` on Google Drive (dummy copy to mutate in-place)

---

## Goal

Given a Planning Center **plan ID**, help the Worship Leader produce an updated **Get Ready Guide (GRG)** on their Google Drive: correct intro metadata from PCO, verified song-scan sources from org Drive (via PCO links), and scan body content copied with template formatting—**only after explicit user signoff**.

**Out of scope (MVP):** ProPresenter, local `CPB_SONG_FILES_ROOT`, debug `blank-doc` UI, tagged scan blocks, deployment/hosting, PCO export of finished guide.

---

## Users & auth

- **User:** Worship Leader (organizer); single operator for MVP.
- **Auth:** One Google OAuth as WL account with read access to org scan files (shared drive as visible to that user) and write access to WL-hosted GRG on Drive.
- **Scopes:** Upgrade from `drive.readonly` to allow **in-place Google Doc writes** (`documents` + Drive read; re-consent required).
- **Shared drives:** If org files live on a Shared drive, use Drive API `supportsAllDrives` / `includeItemsFromAllDrives` when listing/exporting (WL has read via their account).
- **Runtime:** Local dev only (`npm run dev`); persist OAuth refresh tokens locally for MVP (replace in-memory-only sessions before real weekly use).

---

## Document model

### Intro (page 1)

| Property | Rule |
|----------|------|
| Upper boundary | Top of document |
| Lower boundary | **Page break after the last `Song List` entry** (everything through last `Key of …` line stays) |
| Date | Format like sample: `May 24th, 2026` — derived from **reference plan’s date** (PCO plan date fields) |
| Song list lines | `Key of {key}:{title} - {artist}` |
| Key | Plan item’s selected key (`items/{id}/key`) |
| Title | Prefer **plan item title** over PCO `song.title` when they differ |
| Artist | From **Linked Song** on the item’s Song tab (PCO Services API; map to `song` / linked fields) |
| Order | **Songs only** (exclude headers, media, etc.) |
| Roster (BAND/CHOIR blocks) | Include **only if trivial** alongside date + song list |

### Scan sections (page 2+)

| Property | Rule |
|----------|------|
| MVP replacement | **Delete all content after intro**, then insert this week’s scans |
| Section start | **New page** + **title text** (song-header) |
| Header confidence | Bold title line + **horizontal line** before lyrics |
| Header block | Single column: bold title through horizontal rule |
| Lyrics block | **Two columns**; preserve capitalization, highlighting, font color, bolding; change typeface/size only to match template |
| Post-MVP | Tagged blocks for surgical replace; optimized Drive-hosted template |

**Note:** Preserving rich formatting from org scans into a two-column GRG is a major implementation area—MVP may need staged fidelity (structure first, styling second).

### Canonical sources

- **Golden reference:** uploaded `.docx` / sample docx for plan `87788328`.
- **MVP write target:** named Google Doc on WL Drive (path/title config; later post-MVP = template picker).

---

## PCO integration

1. Load plan by ID (auto-resolve service type if omitted).
2. Extract: **event date**, **song order**, per song: **item title**, **key**, **artist** (linked song).
3. Song scan discovery (existing tier logic, extended):
   - **Green** = highest quality path (required for happy path).
   - **Yellow** = allowed with **warning** before signoff.
   - **Red** = notify user; allow skip and continue pipeline.

---

## Org Drive scan resolution

| Step | Rule |
|------|------|
| PCO link | MVP assumes **Google Drive URLs**; non-Drive → **notify**, user acknowledges, **skip song** |
| Green entry | Follow link; if folder, **search entire subtree** for file with **`blank`** in title (case per existing scan naming) |
| Multiple `blank` matches | **Notify user**, manual tie-break (document title list) |
| Ambiguity / partial failure | Show **candidate document titles**; user **selects** source |
| Not extractable (e.g. image PDF) | **Notify and skip** song for MVP |
| File types | Expect **Google-native**; edge types → notify, skip, continue |

---

## User flow (MVP)

```
1. Enter plan ID
2. Connect Google (WL account)
3. Configure / resolve GRG doc (Drive path or title)
4. PCO fetch → build intro draft + per-song inspection
5. Per song (separate steps):
   - Show tier (green/yellow/red), warnings
   - Resolve Drive candidates; user picks if needed
6. Preview aggregated GRG changes (intro + scan sections)
7. User signoff
8. On approve: batchUpdate Google Doc in place
9. On deny / cancel: no writes; if preview used a scratch copy, discard
```

**Signoff rules**

- **Always** required before committing changes.
- Denied signoff → **no writes**.
- User may **skip** sections (intro partial, individual songs); skipped sections get **no write**.
- Cancel → **revert** any tentative changes (implement via preview copy or deferred `batchUpdate` only after signoff).

**Export (MVP):** In-place Google Doc update only (no PDF/docx export). Post-MVP: export to PCO plan item.

---

## Technical implications (engineering)

| Area | Direction |
|------|-----------|
| APIs | PCO Services v2; Google Drive v3 + **Docs API** `documents.get` / `batchUpdate` |
| Scan fetch | Drive export / copy with formatting; subtree search for `blank` |
| UI | Replace diagnostic-first layout with wizard: plan → connect → per-song → preview → signoff |
| Tests | Golden fixture: plan `87788328` ↔ SUN docx content; edit target = Good Friday doc |
| Remove / hide | `blank-doc` experiment, `CPB_SONG_FILES_ROOT` route from MVP UI |

---

## Open engineer defaults (no user answer required)

| Topic | Default |
|-------|---------|
| **7.2 Idempotent re-run** | Running the same plan ID again **replaces** the post-intro body (same as 1.8 delete-all-after-intro). No duplicate scan stacks. |
| **4.5 Shared drive** | Attempt all API calls with shared-drive flags; surface clear error if WL token cannot see file. |
| **7.3 Live co-editing** | Not required MVP; optional later (Docs revision subscription). Acceptable if WL avoids editing during sync. |

---

## Post-MVP (documented, not built)

- Tagged scan blocks for incremental replace
- Optimized GRG template on Drive (configurable)
- Export finished GRG to PCO attachment
- ProPresenter integration
- Deploy to hosted environment (first post-MVP task per user)
