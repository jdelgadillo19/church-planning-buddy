# Slide Deck platform — PRD addendum (2026-06-07)

**Status:** Approved via party mode [`party-2026-06-07-slide-deck-platform.md`](../party/output/party-2026-06-07-slide-deck-platform.md)  
**Extends:** [PROPRESENTER-MVP.md](../PROPRESENTER-MVP.md) (generation) + [PROPRESENTER-SYNC.md](../PROPRESENTER-SYNC.md) (staging/sync)  
**Supersedes for hosted ops:** Interim npm agent as primary operator path

---

## Goal (one sentence)

Any authorized church user builds a **Sunday slide deck plan** in the browser from **PCO + org ProPresenter index**; collaborators **submit row-level drafts** that merge into an **implementation plan**; the **presentation rig** (Mac or Windows) applies it — no terminal, no ProPresenter required for plan generation.

---

## Users & authority

| Actor | Capability |
|-------|------------|
| **Remote planner** (`planner`, `admin`) | Select PCO plan, preview commit, **submit draft**, merge on **Send to rig** |
| **Rig operator** (`operator`, `admin`) | Install rig client, apply pending builds, refresh index |
| **Org admin** | Pair rig to org, manage members, view audit |
| **Presentation rig** | Sole apply authority — validates build against local index |

**Rule:** Cloud never writes to ProPresenter filebase. Remote editors never apply directly.

---

## Relationship to existing tracks

| Track | This addendum |
|-------|---------------|
| **Generation MVP** ([PROPRESENTER-MVP.md](../PROPRESENTER-MVP.md)) | Reuses `manifest`, `commit_plan`, `applyCommitPlan`, `publishSlideDeckPackage` |
| **Sync MVP** ([PROPRESENTER-SYNC.md](../PROPRESENTER-SYNC.md)) | Phase 0–1 uses bundle scanner + snapshots; Phase 2 adds change sets |
| **Hosted GRG** | Same org auth, Google OAuth, Supabase tenancy |
| **Interim agent** | Debug only — see [SLIDE-DECK-DEPRECATION.md](../SLIDE-DECK-DEPRECATION.md) |

---

## What changes from PROPRESENTER-MVP.md

| MVP doc assumption | Platform addendum |
|--------------------|-------------------|
| "Connect ProPresenter (local bridge)" on same machine as dev | PP optional for **preview**; rig client required for **apply** |
| Local library index via live API enumerate | **Cached org index** from `pp_index_snapshots` |
| Single-church pilot | Schema org-scoped from Phase 0; multi-org UI Phase 1 |
| Local agent / file export spike | **Tauri rig client** `.dmg` |

Unchanged: arrangement tile reorder not automatable; signoff before write; new presentation per run.

---

## What changes from PROPRESENTER-SYNC.md

| Sync doc phase | Platform addendum |
|----------------|-------------------|
| Phase 1 scanner rig-local only | Phase 0 adds **cloud snapshot upload** API |
| Phase 2 change sets | Unchanged timeline — **after** rig apply loop validated |
| Rig pull approval | Phase 1 uses row-level merge at Send + rig source review; full PROPRESENTER-SYNC classifier Phase 2 |

---

## Submitted plan vs implementation plan

| Artifact | Storage | Purpose |
|----------|---------|---------|
| **Submitted plan** | `slide_deck_submissions` | Per-user draft snapshot (`commit_plan`, `library_selections`, author) |
| **Implementation plan** | `slide_deck_builds.implementation_plan` | Reconciled playlist rows + provenance; rig applies this |

**Service scope:** `org_id` + `plan_id` + `service_type_id` + `playlist_name`.

**Row identity (`elementKey`):** each playlist preview row — `song:{pcoItemId}` or `template:{correspondence|name}`.

**Merge at Send:** auto-merge when no conflicts; merge review when multiple users touch the same row. Rig operator may override row source before Apply.

---

## Functional requirements

### Web (grapevineprep.com)

1. Build slide deck manifest from PCO plan (existing).
2. Build commit preview from **latest org index snapshot** when ProPresenter not local.
3. Show index freshness: *"Library index last updated {relative time} by {rig name}."*
4. **Submit draft** saves a row-level submission for the service scope.
5. **Send to presentation rig** merges drafts → `implementation_plan` → queues build (merge review if conflicts).
6. Job status with visible loading states and step labels.
7. Org context on all builds (schema Phase 0; switcher UI Phase 1).

### Rig client ("Grapevine Rig")

1. One-time pairing to org (admin-generated code).
2. Periodic index scan → upload snapshot.
3. Poll or receive pending builds for paired org/rig.
4. Apply **implementation plan** (reconciled rows); operator may override per-row source before Apply.
5. Replan apply uses playlist **overwrite** when target playlist is non-empty.
6. Optional: publish to Drive after apply (soft-skip when export unavailable).
7. UI: small persistent window; **Apply Slide Deck** primary button.
8. Windows + Mac installable clients (PLATFORM-1.6.6).
9. Phase 2: ProPresenter startup prompt for pending builds.

### Security

- Per-rig Ed25519 keypair; private key in OS credential store (Keychain / Windows Credential Manager).
- No shared `SLIDE_DECK_AGENT_TOKEN` in production operator docs.
- RLS: `org_id` on `pp_rigs`, `pp_index_snapshots`, `slide_deck_builds`.

---

## Non-functional requirements

| Requirement | Target |
|-------------|--------|
| Operator setup (rig) | &lt; 10 min first install including pairing |
| Service prep (web) | &lt; 20 min plan → queued build |
| Index staleness warning | Banner if snapshot &gt; 7 days old |
| Offline rig | Web can still queue; rig applies when online |

---

## Out of scope (this addendum)

- Lyric tile reorder automation
- Full PROPRESENTER-SYNC Phase 2 conflict classifier UI (row-level merge covers Phase 1 pilot)
- ProPresenter Cloud API
- Replacing `.proplaylist` upload emergency path
- Queue supersede / cancel UI (deferred)

**In scope (PLATFORM-1.6):** Windows rig client for apply + scan.

---

## Pilot success (party metrics)

- [ ] 3 consecutive Sundays: web queue + rig apply only
- [ ] Zero terminal use by non-technical operators
- [ ] Setup &lt; 20 minutes blank → slide-ready
- [ ] Second church onboarded before Phase 2 closes

---

## References

- Party: [`party-2026-06-07-slide-deck-platform.md`](../party/output/party-2026-06-07-slide-deck-platform.md)
- Epics: [SLIDE-DECK-PLATFORM-EPICS.md](./SLIDE-DECK-PLATFORM-EPICS.md)
- Phase 0: [SLIDE-DECK-PHASE-0-SPEC.md](./SLIDE-DECK-PHASE-0-SPEC.md)
- Phase 1: [SLIDE-DECK-PHASE-1-SPEC.md](./SLIDE-DECK-PHASE-1-SPEC.md)
