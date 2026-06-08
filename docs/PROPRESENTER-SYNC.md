# Church Planning Buddy — ProPresenter sync & staging

**Status:** Approved for phased build (Phase 1–2 next)  
**Date:** 2026-06-01  
**Architecture:** [PROPRESENTER-SYNC-ARCHITECTURE.md](./PROPRESENTER-SYNC-ARCHITECTURE.md)  
**Research:** [_bmad-output/planning-artifacts/research/technical-propresenter-sync-file-format-research-2026-06-01.md](../_bmad-output/planning-artifacts/research/technical-propresenter-sync-file-format-research-2026-06-01.md)  
**Context source:** [user-feedback/context-convos/ProPresenter-sync-system-context-2026.06.01.md](./user-feedback/context-convos/ProPresenter-sync-system-context-2026.06.01.md)

**Companion spec:** [PROPRESENTER-MVP.md](./PROPRESENTER-MVP.md) covers **PCO + GRG → new presentation** (generation). This document covers **replacing unsafe whole-bundle Drive sync** with staged change sets.

**Platform integration (2026-06-07):** Phase 0–1 of [planning/SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md](./planning/SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md) implements bundle scanner + cloud snapshot upload before full SYNC Phase 2 change sets. Epics: [planning/SLIDE-DECK-PLATFORM-EPICS.md](./planning/SLIDE-DECK-PLATFORM-EPICS.md).

---

## Goal (one sentence)

Let remote editors **stage** scoped ProPresenter changes (playlists, new assets, bounded file updates) and let the **presentation rig** **review and apply** them—with classification, signoff, restore points, and audit logs—**without ever mirroring or replacing the full ProPresenter filebase**.

---

## Users & authority

| Actor | v1 capability |
|-------|----------------|
| Remote editor | Build change set, push/stage to cloud, push signoff for non-simple |
| Presentation rig | See staged changes, dry-run, pull approval, apply, restore |
| Operator (rig) | Lightweight name selection for audit (`operators.json`) |
| Mac login | Real security gate; CPB operator label is accountability only |

**Rule:** Only the rig may **apply** pulls. Remote devices never write directly to the rig filebase.

---

## Relationship to ProPresenter generation MVP

| | **Generation MVP** | **Sync system (this doc)** |
|--|-------------------|---------------------------|
| **Trigger** | PCO plan + GRG/reference | Manual edits, missing songs, sermon assets, post-service deltas |
| **Output** | New presentation + playlist via API | Change set + optional file blobs |
| **Manifest** | Service order, matches, flags | Filebase snapshot + diff |
| **Writes** | API playlist create after signoff | Staged file copy + API for simple playlist ops |
| **Phase** | PR1 in flight (dry-run manifest) | Phase 1–2 after PR1 |

Both share: preview/signoff culture, no filebase wipe, rig as production authority.

---

## Scope

### In scope (phased)

**Phase 1**

- Local bundle scanner (Libraries, Playlists, media path index)
- Snapshot storage (rig-local + optional cloud copy)
- No writes to ProPresenter except via existing API safety rules

**Phase 2**

- Snapshot diff → change set
- Classification: simple / non_destructive / destructive / conflict
- Push/pull confirmation UI (reuse wizard signoff patterns)
- Audit log schema + operator selection on rig
- Session/live lock UI (replaces WhatsApp/CLI warning)

**Phase 3+** (documented, not current sprint)

- Additive blob staging and rig apply with restore points
- Phase 4: semantic fingerprint for safe LIVE overwrites
- Phase 5: destructive deletes / archive workflow

### Out of scope (v1 sync)

- Whole ProPresenter bundle sync (explicit anti-goal)
- Integrating with legacy Drive mirror as a peer system
- Full user auth / RBAC (device + operator label sufficient)
- Automatic apply without rig pull approval
- Arrangement tile reorder via API (same as generation MVP)
- Replacing ProPresenter Import UI entirely

---

## Classification rules (product)

| Class | Examples | Signoff |
|-------|----------|---------|
| **simple** | Playlist order, membership, service arrangement pick | Sync button or light confirm |
| **non_destructive** | New files, new sermon graphics, new song deck, LIVE-only change (Phase 4+) | Modal listing adds/updates; push + pull |
| **destructive** | Deletes, Master/lyrics change, library presentation remove | Red warning; typed confirm optional; push + pull |
| **conflict** | Base snapshot stale; same song edited on rig and remote | Block apply until review |

See architecture doc for technical enforcement.

---

## User flows

### Remote: stage a change

```
1. Operator runs bundle scan (or CPB uploads scan export)
2. CPB builds change set vs last cloud snapshot
3. Preview classification + file list
4. Push signoff (if non-simple) → upload change set + blobs to Drive
5. Rig notified (in-app digest; P1+ notifications later)
```

### Rig: apply a staged change

```
1. Operator selects name + mode (Editing / Rehearsal / Live)
2. Review staged change set + dry-run (missing assets, conflicts)
3. Pull signoff (if non-simple)
4. Restore point created
5. Apply (PP safe window) → audit log
6. Optional: verify via pp:probe
```

### Generation + manual edit (north-star)

```
1. CPB generates service deck (generation MVP)
2. Operator edits in ProPresenter (manual)
3. Operator scans → stages delta change set (sync)
4. Other devices do not auto-receive; rig approves pull when ready
```

---

## Success metrics (pilot)

| Metric | Target |
|--------|--------|
| Zero whole-bundle wipe incidents attributable to CPB | 0 |
| Staged apply with restore usable | 100% of applies |
| Operator understands classification modal | Qualitative after 2 services |
| External Drive mirror retired | Church policy + no rig startup overwrite |

---

## Dependencies

- ProPresenter 21.3 Local API (read + playlist write allowlist) — Phase 0 complete
- Google OAuth (staging folder) — existing
- Operator bundle path discovery — Phase 1 spike checklist in research doc

---

## Epics

Phase 1–2 stories: [planning/PROPRESENTER-SYNC-EPICS-PHASE-1-2.md](./planning/PROPRESENTER-SYNC-EPICS-PHASE-1-2.md)
