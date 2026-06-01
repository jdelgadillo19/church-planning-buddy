# ProPresenter sync — sequencing decision (party substitute)

**Date:** 2026-06-01  
**Question:** Should sync Phase 1 wait until after generation PR1, or merge bundle scanning into PR1?

**Decision:** **Wait.** Complete generation **PR1** (service manifest dry-run) first. Implement sync **Phase 1** as `src/lib/propresenter/bundle-sync/` without merging into `slide-deck/manifest`.

**Rationale (post technical research):**

| Factor | PR1 first | Merge into PR1 |
|--------|-----------|----------------|
| Different manifest semantics | Service order vs file hashes — conflating confuses operators and agents | High confusion risk |
| Reuse signoff UX | PR1 validates wizard pattern on familiar flow | Would delay PR1 |
| Risk isolation | Filebase scanner touches disk paths; keep off generation critical path | Couples two epics |
| Team focus | One demo: “plan → preview deck” | Two demos, neither done |

**Party mode not run:** Spike + this doc resolve the only open sequencing question from the BMAD guidance plan. Winston/John/Amelia would likely converge on the same split given existing [PROPRESENTER-MVP.md](../PROPRESENTER-MVP.md) PR1 priority in [PROJECT-STATUS.md](../PROJECT-STATUS.md).

**Next gate:** After PR1 ships, start Epic SYNC-1 (bundle scanner).
