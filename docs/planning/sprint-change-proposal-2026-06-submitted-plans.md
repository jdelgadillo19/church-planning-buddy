# Sprint Change Proposal — Submitted vs Implementation Plans

**Date:** 2026-06-08  
**Trigger:** Pilot success (v0.2.5 apply green) exposed replan and multi-planner gaps  
**BMAD workflow:** Correct Course (CC)  
**Status:** Approved for implementation

---

## 1. Issue summary

Grapevine Rig v0.2.5 successfully applies slide decks, but the platform treats each **Send to rig** as a monolithic `commit_plan`. Real church workflow needs:

- **WD** submits songs Tuesday; **Pastor** submits sermon Thursday — **combine**, not full overwrite
- Same user replans one song — **selective row overwrite**
- Rig operator confirms **per-row sources** before ProPresenter write

Queue supersede remains deferred.

---

## 2. Impact analysis

| Area | Impact |
|------|--------|
| **PLATFORM-1.4** Apply engine | Must read `implementation_plan`, not raw `commit_plan`; overwrite on replan |
| **PLATFORM-0.5** Send to rig | Split into Submit draft + Send (merge) |
| **PRD addendum** | New submission/implementation modality; Windows in scope |
| **Schema** | `slide_deck_submissions` table; `implementation_plan` on builds |
| **Rig UI** | Per-row source review before Apply |

**Not affected:** PROPRESENTER-SYNC Phase 2 full conflict classifier (still deferred).

---

## 3. Recommended approach

**Direct adjustment** — new epic **PLATFORM-1.6** (six stories) without rolling back pilot work.

| Increment | Deliverable |
|-----------|-------------|
| 0 | This doc + PRD/epic patches |
| 1 | `elementKey`, `plan-merge.ts`, tests |
| 2 | Submissions API + Submit UX |
| 3 | Merge review + `implementation_plan` on builds |
| 4 | Rig review UI + overwrite apply |
| 5 | Windows Tauri build |

---

## 4. Definitions

| Term | Meaning |
|------|---------|
| **Submitted plan** | Draft snapshot in `slide_deck_submissions` (`commit_plan` + author + scope) |
| **Implementation plan** | Reconciled row-level playlist stored on `slide_deck_builds.implementation_plan` |
| **Service scope** | `org_id` + `plan_id` + `service_type_id` + `playlist_name` |
| **elementKey** | Stable row id: `song:{pcoItemId}` or `template:{correspondence\|name}` |

---

## 5. Merge rules (v1)

- **No conflicts:** auto-merge all drafts → implementation plan → queue
- **Multi-user conflict:** merge review; auto-default = highest change score vs PCO baseline; tie = latest submission
- **Same user:** full overwrite or selective row pick
- **Rig:** defaults from merge; operator may override row source; apply uses **overwrite** playlist resolution

---

## 6. Story handoff (PLATFORM-1.6)

See [SLIDE-DECK-PLATFORM-EPICS.md](./SLIDE-DECK-PLATFORM-EPICS.md) § Epic PLATFORM-1.6.

---

## 7. Deferred

- Queue FIFO supersede / cancel UI
- Drive publish automation on Windows
- Lyric tile reorder in ProPresenter
