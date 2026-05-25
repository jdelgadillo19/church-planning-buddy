# Startup prompt — Phase 1 (ProPresenter manifest / dry-run)

Copy the block below into a **new** Cursor chat to continue Church Planning Buddy.

---

```
I'm continuing Church Planning Buddy (church-planning-buddy/) — Phase 1 after Phase 0.

Read first (in order):
1. docs/STARTUP-PROMPT-PHASE1.md (this file)
2. docs/PROJECT-STATUS.md
3. docs/PROPRESENTER-MVP.md
4. docs/PROPRESENTER-API-SPIKE.md
5. docs/PROPRESENTER-API-SETUP.md

## Shipped before this phase
- GRG MVP: PCO → Drive scans → GRG template apply → signoff (see PRODUCT.md).
- ProPresenter Phase 0 (operator Mac, 2026-05-25): Local API works via TCP transport.

## ProPresenter connection (operator Mac — required for PP features)
- PP_TRANSPORT=tcp
- PP_PORT=64509 (TCP/IP Port ID)
- PP_NETWORK_PORT=64496 optional (Network tab; HTTP may differ)
- Verify: `npm run pp:status` → OK, `npm run pp:probe` → all read steps pass
- .env.local is NOT in git — copy manually or recreate from .env.local.example

## Phase 0 findings (do not re-spike unless broken)
- Transport: TCP JSON on 64509 (HTTP on that port fails with HPE_INVALID — expected)
- 8 libraries, 6 playlist roots; presentation has arrangements, current_arrangement, groups
- No API for arrangement tile reorder; no documented duplicate/create arrangement endpoints
- Safety: PP_ALLOW_WRITES=false by default; library writes blocked; playlist writes allowlisted only

## Phase 1 goal (PR1)
Build worship-plan manifest + dry-run preview — NO ProPresenter writes until signoff.

Deliverables:
1. `src/lib/export/worship-plan.ts` (or agreed path) — types for service order, song match slots, template cue placeholders, flags (READY / NEEDS_ARRANGEMENT / UNRESOLVED)
2. Reuse `loadPlanBundle` / PCO; wire reference doc path (detect/select GRG — manual OK for v1)
3. Optional: read-only ProPresenter library index stub or hook for later matcher (can be minimal in PR1)
4. API route + wizard step or page section: load plan → assemble manifest → preview JSON/table → no apply to PP
5. Golden plans for manual test: 87788328, 87788327

Out of scope for PR1:
- POST playlists / new presentation writes
- Full matcher / SongSelect / arrangement scoring (Phase 2)
- SMS, cloud buffer, tile reorder

Repo: https://github.com/jdelgadillo19/church-planning-buddy
Do not edit .cursor/plans/ unless I ask.

[Your task here — e.g. "Implement PR1 manifest + dry-run preview"]
```

---

**Last updated:** 2026-05-25
