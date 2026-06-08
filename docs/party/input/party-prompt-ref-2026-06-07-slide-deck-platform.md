# Party prompt — Slide Deck platform redesign (2026-06-07)

**Facilitator:** BMAD party-mode  
**Focus:** Design Grapevine Slide Deck for non-technical church operators

---

## User steering request

> Design Grapevine Slide Deck for non-technical church operators: web-hosted plan builder, org-scoped ProPresenter index, thin Mac rig client (no terminal), optional remote editor client, queue + conflict resolution. Deprecate npm agent as debug-only.

## Strategic context

- **Hosted site** (grapevineprep.com) cannot reach ProPresenter Local API or AppleScript export.
- **Interim npm agent** (`slide-deck:agent`) requires terminal, shared `SLIDE_DECK_AGENT_TOKEN`, and repo clone — not acceptable for production operators.
- **Commit JSON** (`commit_plan` + `manifest`) is intent/instructions, not ProPresenter files. Web can build most of it from PCO; library matching needs a **cached org index**, not live PP.
- **PROPRESENTER-SYNC** architecture already defines bundle scanner, snapshots, change sets, rig-as-apply-authority.
- **Tenancy** (`organizations`, `org_members`) exists; `slide_deck_jobs` is user-scoped only (pilot gap).
- **North star:** Any church on the platform builds plans in the browser; presentation rig applies via installable client; remote editors optionally pull/push scoped files with rig-reviewed conflict resolution.

## Repo state at session time

- GRG hosted pipeline working (June 7 apply successful).
- Slide Deck hosted preview works (PCO order); library match degraded without index ("Library not scanned").
- `slide_deck_jobs` migration applied; agent polling but jobs may stay `pending` (token/auth — interim path only).

## Questions for the party

1. Rig client form factor: menu bar daemon vs small window app vs Electron `.dmg`?
2. Phasing: 4-week cadence vs 12-week monolith?
3. Security: per-rig device credentials from day one?
4. Multi-org: org switcher, build stamping, rig org binding?
5. What deprecates from `SlideDeckHostedPanel` Options A/B?

## Participants requested

- John (PM) — phasing, pilot metrics, scope gates
- Winston (Architect) — rig/cloud boundary, schema, security
- Sally (UX) — operator UX, web UI simplification
- Mary (Analyst) — multi-org membership rules
- Link Freeman (Game Dev) — ProPresenter startup integration (referenced in synthesis)
