# Church Planning Buddy — project status

**Last updated:** 2026-05-23  
**Repo:** https://github.com/jdelgadillo19/church-planning-buddy  
**Latest commit (at update):** `e75d4c3` — song scan retrieval (yellow fallback, manual Drive picker)

Use this file as the **session handoff** doc. Spec detail lives in [`PRODUCT.md`](../PRODUCT.md); template setup in [`GRG-TEMPLATE.md`](./GRG-TEMPLATE.md).

---

## Current state (what works)

| Area | Status |
|------|--------|
| **MVP wizard** | Setup → Songs → Preview → Sign off (`src/app/page.tsx`) |
| **PCO plan load** | Plan ID → date, song order, keys, scan tiers, arrangement artist, confirmed roster (`src/lib/pco/plan-bundle.ts`, `plan-team.ts`) |
| **Roster fill** | Confirmed `team_members` → template `[Name \| …]: Position` lines (`src/lib/docs/grg-roster.ts`) |
| **Scan import** | Google Doc scans → header + two-column lyrics with style replay (`src/lib/docs/scan-import.ts`) |
| **PCO scan ranking** | Full attachment scan; prefer MASTER over incidental “song scan”; arrangement-aware pick (`src/lib/pco/scans.ts`) |
| **Drive blank scan (green)** | Pass 1: PCO `open` URL → subtree search for `blank` in title (`src/lib/google/drive-files.ts`) |
| **Drive scan fallback (yellow)** | Pass 2 when blank fails: direct doc as-is, or priority-ranked docs in folder (`src/lib/scan-selection/priority.ts`) |
| **Auto-resolve on Songs step** | Green/yellow songs resolve on plan load (parallel); single match auto-selects |
| **Manual song scan picker** | “Manually select song scan” → lists **Drive documents** inside PCO folders (one level); sets `selectedFileId` without re-running resolution (`/api/mvp/pco-scan-options`) |
| **Template apply** | Copy `Get Ready Guide (TEMPLATE)` → output doc; `replaceAllText` for intro; delete from `{{GRG_SCANS_BEGIN}}`; append scans (`src/lib/docs/grg-template.ts`, `apply/route.ts`) |
| **Output naming** | After plan load, default `Get Ready Guide YYYY.MM.DD` (editable); pattern `GRG_OUTPUT_TITLE` with `{{GRG_DATE}}` |
| **Signoff** | No writes until Approve; template never modified |
| **Local runtime** | `npm run dev` @ http://localhost:3000; tokens in `.data/google-tokens.json` |
| **Unit tests** | `scans.test.ts`, `drive-files.test.ts`, `priority.test.ts` (run via `npx tsx`) |

**Verified by user (2026-05-22):** Template updates correctly; output copy works; date, keys, and song list populate as expected.

**Song scan retrieval (2026-05-23):** User confirmed retrieval is in a good place for edge cases (Peace Be Still folder, Shout To The Lord direct doc).

**Roster + scan formatting (2026-05-23):** PCO confirmed team members fill intro slots; scan sections import from Google Docs with two-column lyrics and style replay (plain fallback).

**Reference assets**

| Asset | Location |
|-------|----------|
| Golden plan ID (intro) | `87788328` |
| Edge-case plan ID (scans) | `87788327` — Peace Be Still, Shout To The Lord, Holy Forever |
| Template docx (placeholders) | `downloads/Get Ready Guide (TEMPLATE).docx` |
| Template on Drive | `Get Ready Guide (TEMPLATE)` (user-uploaded Google Doc) |
| Docx formatter script | `scripts/apply-grg-template-format.py` |

---

## Known issues & limitations

| Item | Severity | Notes |
|------|----------|--------|
| **Scan import fallback** | Low | Google Doc scans use structured import (two-column + styles); non-Docs or failures fall back to plain text |
| **Song list bullets** | Low | `replaceAllText` for `{{GRG_SONG_LIST}}` may not match bulleted layout in every template |
| **Heuristic mutate path** | Deprecated | `src/lib/docs/grg-mutate.ts` `applyGrgUpdate` unused by apply; do not re-enable without reason |
| **Local-only auth** | Ops | OAuth tokens on disk; no hosted deploy or multi-user sessions |
| **`.env` drift** | Ops | README still mentions old output title in one bullet — prefer this file + `.env.local.example` |
| **Service Opener / non-songs** | Low | Filtered by `item_type === "song"` + title heuristics; edge cases may still appear |
| **Image / PDF scans** | MVP skip | Not extractable → user skips song |
| **PRODUCT.md stale lines** | Doc | Still says in-place Good Friday edit; actual flow is template → dated output copy |
| **Manual picker depth** | Low | Only immediate children of PCO folder links; nested subfolders not expanded |

**Resolved (historical)** — see [`user-feedback/`](./user-feedback/):

- `insertPageBreak` / `deleteContentRange` index errors → template + per-section append
- PCO arrangement URL vs Drive → attachment `open` action
- Wrong key / artist / skipped-in-list / `AMay` date corruption → template placeholders + plan bundle fixes
- Blank-only search rejecting yellow scans → priority fallback pass (`2026-23-05-12.38.md`)
- Manual picker showing folders + re-running resolution → Drive doc list + direct `selectedFileId` (`2026-23-05-12.38.md`)

---

## Next steps (agreed priority)

### Near-term polish

1. **Scan format tuning** — refine header/lyrics split heuristics per [`GRG-SCAN-FORMAT.md`](./GRG-SCAN-FORMAT.md); golden tests against live plan `87788327`.

### Near-term polish

2. **Pre-exclude list** — persist plan items to always skip (e.g. Service Opener Video).
3. **Manual preview edits** — edit date/song list in Preview; per-field revert.
4. **Arrangement display** — optional strip of `XX -` prefix on artist line.

### Operational

5. **Deployment** — host beyond localhost; secure token storage.
6. **Automated tests** — plan `87788328` golden intro lines; apply idempotency smoke test.
7. **Clearer errors** — missing template markers, Drive 403, PCO auth.

### Post-MVP

8. Export finished GRG to PCO plan item.  
9. Template/output picker by service type or folder.  
10. Tagged scan blocks for surgical replace (vs delete-to-EOF).

---

## Dev quick start

```bash
cd church-planning-buddy
cp .env.local.example .env.local   # if needed
# Set: PCO_BASIC_TOKEN, GOOGLE_*, GRG_TEMPLATE_TITLE, GRG_OUTPUT_TITLE
npm install
npm run dev
```

1. Open http://localhost:3000  
2. **Reconnect Google** if scopes changed (`drive` + `documents`)  
3. **Verify template** on Drive  
4. **Load plan** → scans auto-resolve on Songs step → Preview → Approve  

**Tests:** `npx tsx src/lib/pco/scans.test.ts` (and `drive-files.test.ts`, `scan-selection/priority.test.ts`)

---

## Startup prompt (next session)

Copy into a new Cursor chat:

```
I'm continuing work on Church Planning Buddy (church-planning-buddy/).

Read docs/PROJECT-STATUS.md first for current state, known issues, and next steps.

Context:
- MVP wizard works end-to-end: PCO plan → Drive scan resolution → copy GRG template to dated output doc → fill {{GRG_DATE}}, {{GRG_SONG_LIST}}, append scans after {{GRG_SCANS_BEGIN}}.
- Song scan retrieval is done (commit e75d4c3): green blank search, yellow priority fallback, auto-resolve, manual Drive doc picker. User verified edge cases on plan 87788327.
- NEXT TASK: formatting migration — scan body fidelity (two-column lyrics, bold/color/highlight), not retrieval.
- Template on Drive: "Get Ready Guide (TEMPLATE)". Output title defaults to "Get Ready Guide YYYY.MM.DD" after plan load.
- Reference plans: 87788328 (intro), 87788327 (scan edge cases). Repo: github.com/jdelgadillo19/church-planning-buddy

Do not edit the plan file at .cursor/plans/ unless I ask.

[Your task here — e.g. "Spike two-column scan paste into GRG"]
```

---

## Doc index

| File | Purpose |
|------|---------|
| [`PROJECT-STATUS.md`](./PROJECT-STATUS.md) | **This file** — progress & handoff |
| [`PRODUCT.md`](../PRODUCT.md) | Approved MVP spec |
| [`MVP-OPEN-QUESTIONS.md`](../MVP-OPEN-QUESTIONS.md) | Completed Q&A archive |
| [`GRG-TEMPLATE.md`](./GRG-TEMPLATE.md) | Placeholder contract & upload steps |
| [`party-2026-05-22.md`](./party-2026-05-22.md) | Early discovery / party-mode notes |
| [`user-feedback/2026-22-05-13.01.md`](./user-feedback/2026-22-05-13.01.md) | Build feedback + fixes log |
| [`user-feedback/2026-22-05-15.09.md`](./user-feedback/2026-22-05-15.09.md) | Apply failures → template pivot |
| [`user-feedback/2026-23-05-12.38.md`](./user-feedback/2026-23-05-12.38.md) | Song scan retrieval edge cases + fixes |
