# Church Planning Buddy — project status

**Last updated:** 2026-05-22  
**Repo:** https://github.com/jdelgadillo19/church-planning-buddy  
**Latest commit (at update):** `fa3b320` — dated output doc titles

Use this file as the **session handoff** doc. Spec detail lives in [`PRODUCT.md`](../PRODUCT.md); template setup in [`GRG-TEMPLATE.md`](./GRG-TEMPLATE.md).

---

## Current state (what works)

| Area | Status |
|------|--------|
| **MVP wizard** | Setup → Songs → Preview → Sign off (`src/app/page.tsx`) |
| **PCO plan load** | Plan ID → date, song order, keys, scan tiers, arrangement artist (`src/lib/pco/plan-bundle.ts`) |
| **Drive blank scan** | Follow PCO attachment `open` URL → subtree search for `blank` (`src/lib/google/drive-files.ts`, `attachment-open.ts`) |
| **Template apply** | Copy `Get Ready Guide (TEMPLATE)` → output doc; `replaceAllText` for intro; delete from `{{GRG_SCANS_BEGIN}}`; append scans (`src/lib/docs/grg-template.ts`, `apply/route.ts`) |
| **Output naming** | After plan load, default `Get Ready Guide YYYY.MM.DD` (editable); pattern `GRG_OUTPUT_TITLE` with `{{GRG_DATE}}` |
| **Signoff** | No writes until Approve; template never modified |
| **Local runtime** | `npm run dev` @ http://localhost:3000; tokens in `.data/google-tokens.json` |

**Verified by user (2026-05-22):** Template updates correctly; output copy works; date, keys, and song list populate as expected.

**Reference assets**

| Asset | Location |
|-------|----------|
| Golden plan ID | `87788328` |
| Template docx (placeholders) | `downloads/Get Ready Guide (TEMPLATE).docx` |
| Template on Drive | `Get Ready Guide (TEMPLATE)` (user-uploaded Google Doc) |
| Docx formatter script | `scripts/apply-grg-template-format.py` |

---

## Known issues & limitations

| Item | Severity | Notes |
|------|----------|--------|
| **Scan body = plain text** | Expected MVP gap | Scans exported as text; no two-column lyrics, colors, or bold from org scans |
| **Song list bullets** | Low | `replaceAllText` for `{{GRG_SONG_LIST}}` may not match bulleted layout in every template |
| **Heuristic mutate path** | Deprecated | `src/lib/docs/grg-mutate.ts` `applyGrgUpdate` unused by apply; do not re-enable without reason |
| **Local-only auth** | Ops | OAuth tokens on disk; no hosted deploy or multi-user sessions |
| **`.env` drift** | Ops | README still mentions old output title in one bullet — prefer this file + `.env.local.example` |
| **Service Opener / non-songs** | Low | Filtered by `item_type === "song"` + title heuristics; edge cases may still appear |
| **Image / PDF scans** | MVP skip | Not extractable → user skips song |
| **PRODUCT.md stale lines** | Doc | Still says in-place Good Friday edit; actual flow is template → dated output copy |

**Resolved (historical)** — see [`2026-22-02-15.09-build-feedback.md`](./2026-22-02-15.09-build-feedback.md), [`2026-22-05-13.01-build-feedback.md`](./2026-22-05-13.01-build-feedback.md):

- `insertPageBreak` / `deleteContentRange` index errors → template + per-section append
- PCO arrangement URL vs Drive → attachment `open` action
- Wrong key / artist / skipped-in-list / `AMay` date corruption → template placeholders + plan bundle fixes

---

## Next steps (agreed priority)

### Near-term polish

1. **Scan formatting fidelity** — two-column lyrics; preserve highlight/bold/color from source scans ([`PRODUCT.md`](../PRODUCT.md) §1.7).
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
4. **Load plan** → resolve scans → Preview → Approve  

---

## Startup prompt (next session)

Copy into a new Cursor chat:

```
I'm continuing work on Church Planning Buddy (church-planning-buddy/).

Read docs/PROJECT-STATUS.md first for current state, known issues, and next steps.

Context:
- MVP wizard works end-to-end: PCO plan → Drive blank scans → copy GRG template to dated output doc → fill {{GRG_DATE}}, {{GRG_SONG_LIST}}, append scans after {{GRG_SCANS_BEGIN}}.
- User verified apply on 2026-05-22. Template on Drive: "Get Ready Guide (TEMPLATE)". Output title defaults to "Get Ready Guide YYYY.MM.DD" after plan load.
- Reference plan: 87788328. Repo: github.com/jdelgadillo19/church-planning-buddy

Do not edit the plan file at .cursor/plans/ unless I ask.

[Your task here — e.g. "Implement pre-exclude list" or "Spike two-column scan paste"]
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
| [`2026-22-05-13.01-build-feedback.md`](./2026-22-05-13.01-build-feedback.md) | Build feedback + fixes log |
| [`2026-22-02-15.09-build-feedback.md`](./2026-22-02-15.09-build-feedback.md) | Apply failures → template pivot |
