# Church Planning Buddy — project status

**Last updated:** 2026-06-03  
**Repo:** https://github.com/jdelgadillo19/church-planning-buddy  
**Latest commit (at update):** `e75d4c3` — song scan retrieval (yellow fallback, manual Drive picker)

Use this file as the **session handoff** doc.

| Doc | Purpose |
|-----|---------|
| [`PRODUCT.md`](../PRODUCT.md) | **GRG MVP** spec (shipped) |
| [`PROPRESENTER-MVP.md`](./PROPRESENTER-MVP.md) | **Active** next epic — PCO + GRG → ProPresenter |
| [`PROPRESENTER-SYNC.md`](./PROPRESENTER-SYNC.md) | Staged sync replacement (Phase 1–2 planned; after PR1) |
| [`PROPRESENTER-SYNC-ARCHITECTURE.md`](./PROPRESENTER-SYNC-ARCHITECTURE.md) | Sync system architecture |
| [`STARTUP-PROMPT.md`](./STARTUP-PROMPT.md) | Copy-paste block for next Cursor session |
| [`GRG-TEMPLATE.md`](./GRG-TEMPLATE.md) | Placeholder contract & upload steps |
| [`GRG-FORMAT-SPEC.md`](./GRG-FORMAT-SPEC.md) | Post-MVP format architecture |
| [`planning/RENAME-TO-GRAPEVINE.md`](./planning/RENAME-TO-GRAPEVINE.md) | **Deferred** — product rename Church Planning Buddy → **Grapevine** |

---

## Strategic direction (2026-05-24)

**North star:** *Service deck assembly agent* — Planning Center + Get Ready Guide (reference) → **ProPresenter 21.3** playlist in a **new presentation**, with preview/signoff before writes.

**Outcome:** *“I only have to plan once, then everything's basically automatic.”*

Party archive + questionnaire: [`party/output/party-2026-05-24.md`](./party/output/party-2026-05-24.md).

**ProPresenter Local API (21.3, operator Mac):**

| Capability | Status |
|------------|--------|
| Playlist create | Yes |
| Arrangement tile reorder | **No** (undocumented) |
| Library enumerate | Yes |
| Native full-text search | **No** → CPB builds local index |

**Architecture:** ProPresenter = library source + playlist sink; CPB = match, index, preview, signoff.

**Safety:** Always new presentation; no unrelated file overwrites; avoid filebase-destructive API paths (rig has known empty-folder wipe bug).

---

## Current state — GRG MVP (shipped)

| Area | Status |
|------|--------|
| **MVP wizard** | Setup → Songs → Preview → Sign off (`src/app/page.tsx`) |
| **PCO plan load** | Plan ID → date, song order, keys, scan tiers, arrangement artist, confirmed roster (`src/lib/pco/plan-bundle.ts`, `plan-team.ts`) |
| **Roster fill** | Platform Team confirmed positions → BAND/CHOIR blocks (`grg-roster.ts`, `grg-roster-consolidate.ts`) |
| **Template validation** | Pre-apply `{{GRG_*}}` check (`grg-template.ts`) |
| **Scan import** | Google Doc scans → header + two-column lyrics (`src/lib/docs/scan-import.ts`) |
| **PCO scan ranking** | MASTER preference; arrangement-aware pick (`src/lib/pco/scans.ts`) |
| **Drive resolution** | Green blank search + yellow priority fallback + manual picker |
| **Template apply** | Copy template → dated output; intro + append scans (`apply/route.ts`) |
| **Signoff** | No writes until Approve; template never modified |
| **Local runtime** | `npm run dev` @ http://localhost:3000 |
| **Unit tests** | `scans.test.ts`, `drive-files.test.ts`, `priority.test.ts` |

**Reference assets**

| Asset | Location |
|-------|----------|
| Golden plan ID (intro) | `87788328` |
| Edge-case plan ID (scans) | `87788327` |
| Template on Drive | `Get Ready Guide (TEMPLATE)` |

---

## Current state — ProPresenter MVP (Phase 0 complete on operator Mac)

| Area | Status |
|------|--------|
| **Local API client** | `src/lib/propresenter/` — HTTP + **TCP** transport, safety, probe, diagnose |
| **Operator connection** | `PP_TRANSPORT=tcp`, `PP_PORT=64509` — `pp:status` OK, `pp:probe` OK |
| **HTTP routes** | `GET /api/propresenter/status`, `POST /api/propresenter/probe` |
| **CLI** | `pp:status`, `pp:diagnose`, `pp:probe` |
| **Phase 0 spike** | [`PROPRESENTER-API-SPIKE.md`](./PROPRESENTER-API-SPIKE.md) filled (libraries, arrangements paths) |
| **Manifest / matcher / writes** | Not started — **next: PR1 dry-run manifest** |

Spec: [`PROPRESENTER-MVP.md`](./PROPRESENTER-MVP.md).

---

## Known issues & limitations

| Item | Severity | Notes |
|------|----------|--------|
| **PP tile reorder** | **MVP constraint** | Cannot auto-align LIVE tiles to GRG via API; use match + select + NEEDS_ARRANGEMENT |
| **Scan import fallback** | Low | Non-Docs → plain text |
| **Local-only auth** | Ops | OAuth tokens on disk |
| **Manual picker depth** | Low | One level under PCO folder links |
| **Image / PDF scans** | GRG skip | User skips song |
| **PP filebase wipe** | **Ops / rig** | External bug; CPB must not trigger destructive library sync |

---

## Next steps (agreed priority)

### ProPresenter MVP — Phase 0

Done on operator Mac: TCP transport, probe, spike doc. Optional later: controlled write spike (`PP_ALLOW_WRITES=true`, throwaway playlist only).

### ProPresenter MVP — Phase 1+ (next)

1. **Manifest + dry-run** — `worship-plan` types, preview UI, zero PP writes (PR 1).
4. **GRG/reference picker** — detect, select, or apply GRG; manual steps for debug.
5. **Library index + matcher** — enumerate → cache; title/lyrics/CCLI match.
6. **Local bridge + playlist write** — after signoff; golden plans `87788328`, `87788327`.

### GRG maintenance (when blocked on PP)

- Scan format tuning per [`GRG-SCAN-FORMAT.md`](./GRG-SCAN-FORMAT.md) if needed for arrangement scoring input.
- Pre-exclude list, manual preview edits, deployment — deferred behind PP wedge.

### Post-MVP (both tracks)

- Export finished GRG to PCO; tagged scan blocks; cloud buffer + remote prep; role-based modules.

---

## Dev quick start

```bash
cd church-planning-buddy
cp .env.local.example .env.local   # if needed
npm install
npm run dev
```

1. Open http://localhost:3000  
2. **Reconnect Google** if scopes changed  
3. GRG flow: Load plan → Songs → Preview → Approve  

**Tests:** `npx tsx src/lib/pco/scans.test.ts` (and `drive-files.test.ts`, `scan-selection/priority.test.ts`)

---

## Startup prompt

Use **[`docs/STARTUP-PROMPT.md`](./STARTUP-PROMPT.md)** — copy the fenced block into a new Cursor chat.

---

## Doc index

| File | Purpose |
|------|---------|
| [`PROJECT-STATUS.md`](./PROJECT-STATUS.md) | **This file** — progress & handoff |
| [`STARTUP-PROMPT.md`](./STARTUP-PROMPT.md) | Next-session copy-paste |
| [`PROPRESENTER-MVP.md`](./PROPRESENTER-MVP.md) | Active ProPresenter spec |
| [`PRODUCT.md`](../PRODUCT.md) | GRG MVP spec (shipped) |
| [`party/output/party-2026-05-24.md`](./party/output/party-2026-05-24.md) | Party mode + questionnaire |
| [`party/output/party-2026-05-22.md`](./party/output/party-2026-05-22.md) | Early GRG discovery |
| [`user-feedback/`](./user-feedback/) | Build feedback logs |
| [`planning/RENAME-TO-GRAPEVINE.md`](./planning/RENAME-TO-GRAPEVINE.md) | Planned rebrand (not started) |
