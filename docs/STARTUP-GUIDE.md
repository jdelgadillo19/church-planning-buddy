# Grapevine Prep — startup guide

**Use this when you return to slide-deck / rig / hosted platform work.**

| | |
|---|---|
| **Last updated** | 2026-06-11 |
| **Repo** | https://github.com/jdelgadillo19/church-planning-buddy |
| **Latest commit** | `227de7b` — submitted plans, apply hardening, rig v0.2.6 |
| **Live site** | https://grapevineprep.com |
| **Rig release** | Tag `grapevine-rig-v0.2.6` (GitHub → Actions → Releases) |

Broader GRG wizard status: [`PROJECT-STATUS.md`](./PROJECT-STATUS.md). Copy-paste AI prompt: [`STARTUP-PROMPT.md`](./STARTUP-PROMPT.md).

---

## What we built (slide deck platform)

```text
Planner (grapevineprep.com)          Presentation rig (Grapevine Rig app)
─────────────────────────            ────────────────────────────────────
PCO plan → commit preview            Poll pending builds
Submit draft (row-level snapshots)   Review implementation plan per row
Send to rig (merge drafts)     →     Apply to ProPresenter (overwrite)
                                     Scan now → library index upload
```

- **Submitted plan** — per-user draft in `slide_deck_submissions`
- **Implementation plan** — merged playlist on `slide_deck_builds.implementation_plan` (what the rig applies)
- **Missing songs** — Send/Submit blocked until library match; rig path documented in [`planning/new-song-entry-workflow.md`](./planning/new-song-entry-workflow.md) (SongSelect/CCLI Path A)

**Deferred:** queue supersede/cancel UI, automated SongSelect import, full PROPRESENTER-SYNC Phase 2.

---

## One-time / prod checklist

| Step | Command or action |
|------|-------------------|
| Supabase migrations | Through `20260609140000_slide_deck_submissions.sql` (submissions + `implementation_plan`) |
| Web deploy | `npm run deploy:cf` from repo root |
| Multi-user org | `org_members` rows + Google OAuth test users — [`HOSTING-GRAPEVINE.md`](./HOSTING-GRAPEVINE.md) |
| Shared drive (GRG) | Template + Output on church Shared drive; planners as **Content manager** — [`planning/multi-user-ops-and-shared-drive.md`](./planning/multi-user-ops-and-shared-drive.md) |
| **Presentation rig** | Pair Grapevine Rig on sanctuary Mac → **Scan now** — [`INSTALL-GRAPEVINE-RIG.md`](./INSTALL-GRAPEVINE-RIG.md) |
| Rig installer | Push tag `grapevine-rig-v0.2.6` (or newer) → install `.dmg` from GitHub Releases |
| Env on Cloudflare | `SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, Google OAuth — see [`HOSTING-GRAPEVINE.md`](./HOSTING-GRAPEVINE.md) |

---

## Local dev

```bash
cd church-planning-buddy
cp .env.local.example .env.local   # if first time
npm install
npm run dev                        # http://localhost:3000
```

| Task | Command |
|------|---------|
| Hub shell (canonical UI) | `cd ../gojito-platform && npm run dev` → http://127.0.0.1:5173/ |
| Slide deck page only | http://localhost:3000/slide-deck |
| ProPresenter probe (Mac w/ PP) | `npm run pp:diagnose` |
| Rig worker (terminal, paired) | `npm run rig:worker-run` (needs `BUILD_ID`, `RIG_ID`, `RIG_SECRET`) |
| Rig Tauri dev | `npm run rig:prepare && cd apps/grapevine-rig && npm run tauri dev` |
| Unit tests (slide deck) | `npx tsx src/lib/slide-deck/plan-merge.test.ts` |
| | `npx tsx src/lib/slide-deck/apply-commit.test.ts` |
| | `npx tsx src/lib/slide-deck/playlist-match.test.ts` |

Without Supabase env vars, hosted auth is off — use local PP apply paths only.

---

## Deploy web (grapevineprep.com)

```bash
npm run deploy:cf
```

Expect ~7 min build + upload. Success ends with `Deployed grapevine-prep` and custom domains listed.

---

## Ship a new Grapevine Rig build

1. Bump version in `apps/grapevine-rig/package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. `npm run rig:prepare` (rebuilds `worker.mjs` into Tauri resources)
3. Commit, push `main`
4. `git tag grapevine-rig-v0.2.x && git push origin grapevine-rig-v0.2.x`
5. GitHub Actions **Grapevine Rig Release** → download `.dmg` / Windows installer

Operator install: [`INSTALL-GRAPEVINE-RIG.md`](./INSTALL-GRAPEVINE-RIG.md)

---

## Sunday workflow (operators)

| Who | Steps |
|-----|--------|
| Planner | grapevineprep.com → Slide deck → preview → fix missing/ambiguous songs → **Submit draft** (optional) → **Send to presentation rig** |
| Rig | Grapevine Rig → **Scan now** (after library changes) → **Apply Slide Deck** when build ready |
| Planner | **Refresh status** on web until Completed |

If apply fails, rig **v0.2.6+** keeps the build visible with **Retry apply**.

---

## Key code paths

| Area | Location |
|------|----------|
| Submit / merge / queue API | `src/app/api/pp/submissions/`, `src/app/api/pp/builds/` |
| Merge engine | `src/lib/slide-deck/plan-merge.ts` |
| Apply + fail-fast | `src/lib/slide-deck/apply-commit.ts` |
| Rig worker | `apps/grapevine-rig-worker/src/worker.ts` |
| Hosted UI | `src/components/slide-deck-hosted-panel.tsx` |
| Rig UI | `apps/grapevine-rig/frontend/main.js` |

---

## Planning docs (BMAD)

| Doc | Purpose |
|-----|---------|
| [`planning/SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md`](./planning/SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md) | Product rules |
| [`planning/SLIDE-DECK-PLATFORM-EPICS.md`](./planning/SLIDE-DECK-PLATFORM-EPICS.md) | Epic PLATFORM-1.6 stories |
| [`planning/sprint-change-proposal-2026-06-submitted-plans.md`](./planning/sprint-change-proposal-2026-06-submitted-plans.md) | Correct Course record |
| [`planning/new-song-entry-workflow.md`](./planning/new-song-entry-workflow.md) | Missing song / SongSelect on rig |
| [`planning/multi-user-ops-and-shared-drive.md`](./planning/multi-user-ops-and-shared-drive.md) | **Multi-planner GRG Drive + rig ops gate** |

---

## Current ops milestone (2026-06-11)

Second Grapevine user is live in Supabase. **GRG** needs Shared drive layout (personal Gmail ownership breaks Apply for other planners). **Slide deck** web path is built; the **presentation rig** is the next real-world gate — without a paired rig and index snapshot, planners cannot complete Send → Apply on Sunday.

Full checklist: [`planning/multi-user-ops-and-shared-drive.md`](./planning/multi-user-ops-and-shared-drive.md).

---

## Cursor session prompt (copy below)

```text
Church Planning Buddy / Grapevine Prep — slide deck platform.

Read docs/STARTUP-GUIDE.md and docs/planning/SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md first.

Live: grapevineprep.com. Rig: Grapevine Rig v0.2.6+. Migrations through 20260609140000.

Stack: Next.js on Cloudflare, Supabase auth/RLS, Grapevine Rig (Tauri) + Node worker for ProPresenter apply.

Do not delete cakery-bakery / calculator-cove / gojito-platform (Gojito family).
```

---

## Likely next work (when you pick this up again)

1. **Presentation rig at church** — install, pair, Scan now, dry-run Send → Apply ([`INSTALL-GRAPEVINE-RIG.md`](./INSTALL-GRAPEVINE-RIG.md))
2. **Shared drive migration** — move GRG Template/Output (+ scans) off personal Gmail ([`planning/multi-user-ops-and-shared-drive.md`](./planning/multi-user-ops-and-shared-drive.md))
3. **New song entry** — optional PCO CCLI # in missing-song UI; SongSelect automation (Phase 2)
4. **Queue supersede** — cancel/replace pending build (deferred from PLATFORM-1.6)
5. **GRG Drive delete** — engineering: trash instead of permanent API delete for multi-editor cases
6. **Windows rig** — verify CI installer on a real Windows + PP box
