# Multi-user ops, Shared drive, and presentation rig

**Status:** Active operations (2026-06-10)  
**Context:** Second Grapevine user onboarded (`jesse@saddleback.de`); GRG Apply exposed Google Drive **owner vs editor** limits; slide deck platform is built but needs the **physical presentation rig** in the weekly loop.

Use this doc when onboarding planners, fixing Drive 403s, or standing up the rig for the first time at a church.

---

## Where we are

| Layer | State |
|-------|--------|
| **Supabase org** | Many users per org via `org_members` — manual SQL onboarding ([`HOSTING-GRAPEVINE.md`](../HOSTING-GRAPEVINE.md) §4) |
| **Google sign-in** | OAuth app in **Testing** — each teammate email must be a **test user** (or publish app / Workspace Internal) |
| **GRG (browser)** | Works per-user Google tokens; **multi-planner blocked** when output files are owned by one personal Gmail |
| **Slide deck (browser)** | Preview + Submit + Send implemented on grapevineprep.com |
| **Presentation rig** | **Next operational gate** — pair Grapevine Rig, Scan now, Apply Slide Deck ([`INSTALL-GRAPEVINE-RIG.md`](../INSTALL-GRAPEVINE-RIG.md)) |

**Milestone:** Auth + org membership are no longer the only blockers. Church ops need **Shared drive layout** (GRG) and **rig pairing** (slide deck) before multiple `@saddleback.de` planners can run Sunday prep end-to-end.

---

## Recommended Google Shared drive structure

Move church-owned Grapevine assets off individual My Drive accounts. One **Shared drive** (e.g. `Saddleback Berlin — Grapevine`) with predictable folders:

```text
Shared drive: Saddleback Berlin — Grapevine
├── Get Ready Guide/
│   ├── Template/
│   │   └── Get Ready Guide (TEMPLATE)     ← never modified by app; copy source
│   └── Output/
│       └── Get Ready Guide YYYY.MM.DD     ← recreated each Apply run
├── Song Scans/                            ← PCO-linked scan library (read for all planners)
│   └── … (existing scan tree)
└── Slide Deck/                            ← legacy; see filebase-architecture.md for Services/ + Filebase/
    └── …
```

**Presentation filebase:** See **[`filebase-architecture.md`](./filebase-architecture.md)** for `Filebase/`, `Services/{date}/`, selective pull, and Gameday package layout.

### Membership (Shared drive)

| Person | Role | Why |
|--------|------|-----|
| Worship planners (`planner` / `admin` in Supabase) | **Content manager** | Create/delete dated GRG output; copy template; same API rights for multi-user Apply |
| Tech / rig operator | **Content manager** or **Contributor** | Rig publish path; index is org-scoped in Supabase, not Drive |
| Broader staff | **Viewer** | Read-only if needed |

**Do not rely on per-file Editor share** from a personal Gmail owner — Editors get **Remove from view**, not trash/delete. Grapevine Apply calls Drive API **permanent delete** on existing output before copy; only **owner** or Shared drive **Content manager** succeeds.

### Env vars (production)

Point `GRG_TEMPLATE_FOLDER_ID` and `GRG_OUTPUT_FOLDER_ID` (or paths) at folders **inside the Shared drive**. Same values for all users — folders are church-wide; **tokens are per-user** ([`HOSTING-GRAPEVINE.md`](../HOSTING-GRAPEVINE.md)).

After moving folders, update Cloudflare Worker env via `npm run env:cf` and confirm each planner can open Template + Output in the browser while signed in as their church Google account.

---

## GRG multi-user failure mode (documented 2026-06-10)

**Symptom:** `Drive delete failed (403)` on Apply from second planner.

**Cause:** First Apply created `Get Ready Guide 2026.06.21` owned by `jesse.delgadillo19@gmail.com`. Second planner `jesse@saddleback.de` had **Editor** on the file but Drive UI offered only **Remove from view** — file remains for Apply lookup → API DELETE → 403.

**Immediate workaround:** Owner moves dated output to **Trash**, then second planner retries Apply.

**Durable fix:** Shared drive + Content managers (above). **Engineering follow-up:** change `driveDeleteFileFetch` to **trash** (`trashed: true`) instead of permanent DELETE — may help some Editor cases but Shared drive remains the right ops model.

---

## Presentation rig — next ops gate

Cloudflare cannot reach ProPresenter on the sanctuary Mac. After web preview works for multiple planners, **Grapevine Rig** on the presentation computer completes the loop.

### One-time rig setup

| Step | Who | Doc |
|------|-----|-----|
| Org admin on grapevineprep.com | Generate pairing code (Slide deck → Presentation rigs) | [`INSTALL-GRAPEVINE-RIG.md`](../INSTALL-GRAPEVINE-RIG.md) §3 |
| Rig operator | Install `Grapevine-Rig-*-macos.dmg` from GitHub Releases (v0.2.6+) | Same |
| Rig operator | Pair Mac, set ProPresenter TCP port, **Scan now** | Same §4–5 |
| Planner | Confirm web shows index freshness (“Library index last updated … by {rig}”) | [`STARTUP-GUIDE.md`](../STARTUP-GUIDE.md) |

### Weekly loop (planners + rig)

```text
Planners (grapevineprep.com)          Presentation rig (Grapevine Rig)
────────────────────────────          ────────────────────────────────
Load PCO plan → preview               Scan now (after new songs in PP)
Submit draft (per planner, optional)  Poll pending builds
Send to presentation rig       →      Review implementation plan
Refresh status ← Completed            Apply Slide Deck (PP open)
```

Missing songs: [`new-song-entry-workflow.md`](./new-song-entry-workflow.md) — rig adds song in ProPresenter → Scan now → planner refreshes preview.

### What the rig does *not* solve

- **GRG Drive ownership** — still Shared drive + per-user Google on web
- **Supabase invites** — still manual `org_members` SQL
- **PCO auth** — deployment-wide `PCO_*` env on Worker

---

## Onboarding checklist (new planner)

1. Add Google OAuth **test user** (until app published) — [`HOSTING-GRAPEVINE.md`](../HOSTING-GRAPEVINE.md)
2. User signs in once at grapevineprep.com → note Supabase user UUID
3. `insert into org_members (…)` with role `planner` or `admin`
4. Confirm **Content manager** on Grapevine Shared drive (not just Editor on one file)
5. User **Continue with Google** → Drive/Docs consent; hub shows Connected
6. GRG: test Apply on a service date after owner cleared any stale personal-owned output
7. Slide deck: confirm index snapshot exists (rig Scan now) before Send

---

## Onboarding checklist (presentation rig)

1. Migrations through `20260609140000_slide_deck_submissions.sql` applied
2. Org **admin** generates pairing code on web
3. Install Grapevine Rig on presentation Mac; pair; save PP port (TCP)
4. **Scan now** — verify `pp_index_snapshots` in Supabase / freshness on web
5. Dry run: planner **Send to rig** → rig **Apply Slide Deck** → web **Completed**
6. Document rig display name and who operates Sunday apply

---

## Related docs

| Doc | Topic |
|-----|--------|
| [`HOSTING-GRAPEVINE.md`](../HOSTING-GRAPEVINE.md) | Supabase auth, org seed, deploy |
| [`GRG-TEMPLATE.md`](../GRG-TEMPLATE.md) | Template placeholders, folder paths |
| [`INSTALL-GRAPEVINE-RIG.md`](../INSTALL-GRAPEVINE-RIG.md) | Rig install, pair, troubleshoot |
| [`STARTUP-GUIDE.md`](../STARTUP-GUIDE.md) | Sunday workflow, ship rig build |
| [`SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md`](./SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md) | Product rules for web + rig |
| [`filebase-architecture.md`](./filebase-architecture.md) | GDrive filebase, selective pull, Gameday packages |
| [`m0-drive-repoint.md`](./m0-drive-repoint.md) | Re-point GRG + PP env to new layout root |
| [`filebase-migration-plan.md`](./filebase-migration-plan.md) | M0–M5 strangler migration from existing code |
