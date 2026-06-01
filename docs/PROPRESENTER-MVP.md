# Church Planning Buddy — ProPresenter MVP spec

**Status:** Approved from party mode + questionnaire (2026-05-24)  
**Target:** ProPresenter **21.3** (local Mac rig)  
**Pilot:** Single church (operator church)

Strategic context: [`party/output/party-2026-05-24.md`](./party/output/party-2026-05-24.md), [`party/input/party-prompt-ref-2026-05-24.md`](./party/input/party-prompt-ref-2026-05-24.md).

The **GRG MVP** remains documented in [`PRODUCT.md`](../PRODUCT.md) (shipped). This document is the **active** product spec for the next build.

**Related (separate track):** [PROPRESENTER-SYNC.md](./PROPRESENTER-SYNC.md) — staged change-set sync to **replace unsafe whole-bundle Drive sync** (not generation from PCO/GRG). Build sequencing: finish this doc’s PR1 first, then sync Phase 1 per [planning/PROPRESENTER-SYNC-SEQUENCING.md](./planning/PROPRESENTER-SYNC-SEQUENCING.md).

---

## Goal (one sentence)

From a **Planning Center plan** and a **Get Ready Guide (or selected reference doc)**, produce a **new ProPresenter presentation** with a **complete playlist** (correct service order, matched library songs, required template cues included)—**only after explicit signoff**—without destructive changes to unrelated files or existing slide actions.

**Outcome (operator):** *“I only have to plan once, then everything's basically automatic.”*

---

## Users & responsibility

| Role | MVP |
|------|-----|
| **Primary operator** | Whoever manages planning (today: operator; later: WL or tech director modules) |
| **Pre-approve blame** | Person who authored the reference doc (GRG writer, scan/Ableton labeler) |
| **Post-approve blame** | Person who signed off on the CPB preview |

---

## What “completed” means (MVP)

1. **New presentation** created every run (never overwrite another week’s deck).
2. **Playlist** contains **100%** of required elements on week 1:
   - All PCO songs in correct **service order**
   - All configured **template playlist items** (e.g. countdown) **present** — verify inclusion only
3. **Song slides:** Link to existing library media when match confidence is sufficient; select **LIVE** arrangement when structure matches reference; otherwise flag **NEEDS_ARRANGEMENT**.
4. **Song lyric arrangement:** Target **~80%** correct without manual tile work week 1; **~90%** low-touch by week 4 pilot.
5. **Do not** in v1: edit non-lyric slide **content**, **media/timer settings**, or **slide actions**; do not remove or alter template cue internals.

**Not MVP “complete”:** Full automation of arrangement **tile reorder** inside ProPresenter (see API constraints).

---

## Scope

### In scope (v1)

- **Song lyric arrangement order** as primary automation focus (via match + arrangement **selection**, not tile API reorder).
- PCO plan load (reuse `plan-bundle`).
- **Reference doc:** detect existing GRG on Drive **or** select one **or** run GRG apply in-session (manual paths required for debug).
- **Conflict rule:** PCO wins **order and song metadata**; GRG/reference wins **lyric structure** for matching/scoring.
- **Local library index** in CPB (enumerate via ProPresenter Local API; app-side search/match).
- **Matcher:** title, lyrics similarity, CCLI when available.
- **Matched song:** prefer existing **LIVE** arrangement if structure score ≥ threshold; else **MASTER** or best score + **NEEDS_ARRANGEMENT**.
- **Unmatched song** (ordered contingencies):
  1. SongSelect (if configured) — lyrics + CCLI
  2. **MASTER** from org scan doc when present
  3. **MASTER** from GRG-only layout; then create **LIVE** per operator workflow when API allows
- **Playlist create** via Local API after signoff.
- **Completion report:** READY / NEEDS_ARRANGEMENT / UNRESOLVED per item.
- **Safety:** No filebase wipe; no overwrite of unrelated week’s GRG or presentation.

### Out of scope (8 weeks)

- SMS / volunteer file bot
- Additional integrations beyond PCO + Drive/GRG + ProPresenter (+ SongSelect on contingency path only)
- Ableton as source of truth
- gdrive-organizer runtime dependency
- Cloud buffer server + remote prep → deck import (documented future)
- Non-song GRG content on ProPresenter slides (v1 = song info only)
- Editing welcome/sermon/countdown **content** or **actions**

---

## ProPresenter Local API (21.3) — verified constraints

| Capability | Supported |
|------------|-----------|
| **Playlist create** | Yes |
| **Arrangement tile reorder** | **No** (no documented API) |
| **Library enumerate/query** | Yes |
| **Native full-text library search** | **No** — CPB builds **local search index** |

**Architecture:**

- **ProPresenter** = content source (enumeration) + playlist sink (create presentation, build playlist).
- **CPB** = search, match, organization intelligence, preview, signoff.

**Implication:** CPB cannot programmatically reorder LIVE arrangement tiles to match GRG. Automation stops at **best arrangement selection** + explicit **NEEDS_ARRANGEMENT** flags; manual tile work in ProPresenter remains a bounded exception.

**Future rig note:** Operator reports occasional bug that **overwrites entire presentation filebase with empty folder** — CPB must avoid any API usage that triggers library/filebase sync destructive paths; always target **named new presentation** only.

**Open spike (next session):** Can API **select** arrangement by name? **Duplicate/create** arrangement? What fields does enumeration return per song (tile labels, order)?

---

## User flow (target)

```
1. Enter PCO plan ID
2. Connect Google (existing) + Connect ProPresenter (local bridge)
3. Reference doc: detect GRG / select existing / or run GRG apply
4. Refresh library index (enumerate)
5. Assemble manifest: order, matches, arrangement picks, template inclusions, flags
6. Preview + signoff (no ProPresenter writes until approved)
7. Approve → create new presentation → build playlist
8. Completion report; operator handles NEEDS_ARRANGEMENT in ProPresenter if any
```

Manual clickthrough between steps is **required** for testing/debugging in early builds.

---

## Technical direction

| Area | Direction |
|------|-----------|
| **Reuse** | `plan-bundle`, scan/GRG parsers, wizard signoff pattern |
| **New** | `src/lib/export/worship-plan.ts`, `src/lib/propresenter/index-cache.ts`, matcher, playlist builder, local PP bridge |
| **Shared** | `resolvePlanContext(planId)` — PCO + optional GRG state for GRG apply and PP export |
| **First PR** | Manifest + dry-run preview (zero ProPresenter writes) |
| **Golden plans** | `87788328` (intro/metadata), `87788327` (scan/arrangement edge cases) |

---

## Pilot success

| Metric | Target |
|--------|--------|
| Playlist elements present | 100% week 1 |
| Song arrangement acceptable without rework | ~80% week 1 → ~90% by week 4 |
| Approver “would run again” | ≥ **4 / 5** |
| Churches in pilot | **1** (operator church) |

---

## Phased delivery (summary)

| Phase | Deliverable |
|-------|-------------|
| **0** | API spike doc (arrangement select/duplicate/create; enumeration shape); safety rules |
| **1** | Reference doc picker + manifest + dry-run UI |
| **2** | Library index + matcher + arrangement scorer + NEEDS_ARRANGEMENT |
| **3** | Local bridge + signoff + new presentation + playlist create |
| **4** | Golden-plan harness, overrides store, pilot timing |

Detail: [`party/output/party-2026-05-24.md`](./party/output/party-2026-05-24.md) (questionnaire + revised plan).

---

## Long-term (not this build)

- Role-based modules (WL vs tech director approval surfaces)
- Cloud-hosted prep buffer + connected deck import
- Arrangement tile automation if API or safe mechanism appears
- Production SOT hierarchy (Ableton, etc.) + gdrive-organizer standards
