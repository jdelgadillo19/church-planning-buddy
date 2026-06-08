# Slide Deck — deprecation: interim hosted operator paths

**Date:** 2026-06-07  
**Replaced by:** [SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md](./planning/SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md)  
**Party record:** [party-2026-06-07-slide-deck-platform.md](./party/output/party-2026-06-07-slide-deck-platform.md)

---

## Summary

The **npm Mac agent** and **CLI-first hosted panel** (Options A/B) were an interim bridge after moving to grapevineprep.com. They are **deprecated as primary operator paths** in favor of:

1. **Web:** Send to presentation rig
2. **Mac:** Grapevine Rig app (Phase 1)
3. **Emergency:** Upload `.proplaylist` (Option C — retained)

---

## Deprecated for operators

| Item | Status | Replacement |
|------|--------|-------------|
| `npm run slide-deck:agent` as recommended path | Deprecated | Grapevine Rig `.dmg` |
| `SLIDE_DECK_AGENT_TOKEN` in production | Deprecated | Per-rig Ed25519 pairing |
| `slide_deck_jobs` table (new writes) | Deprecated | `slide_deck_builds` |
| Slide Deck UI Option A (Mac agent) | Hidden → Advanced | Send to presentation rig |
| Slide Deck UI Option B (CLI commands) | Hidden → Advanced | Grapevine Rig |
| [`docs/SLIDE-DECK-AGENT.md`](./SLIDE-DECK-AGENT.md) as primary setup | Superseded | Phase 1 spec + rig pairing |

---

## Retained (not deprecated)

| Item | Reason |
|------|--------|
| Option C — upload `.proplaylist` | Emergency when automation fails |
| `npm run slide-deck:apply` / `publish` | Debug, CI, developer recovery |
| `npm run slide-deck:agent` | Debug until Grapevine Rig ships |
| `runSlideDeckAgentJob`, `applyCommitPlan`, `publishSlideDeckPackage` | Core logic reused in rig client |
| [`docs/PROPRESENTER-PUBLISH.md`](./PROPRESENTER-PUBLISH.md) | Drive handoff semantics unchanged |

---

## UI migration ([`SlideDeckHostedPanel`](./src/components/slide-deck-hosted-panel.tsx))

### Before (interim)

- Option A — Mac agent (recommended)
- Option B — CLI on prep Mac
- Option C — Upload `.proplaylist`

### After (Phase 0+)

**Primary (always visible):**

- **Send to presentation rig** — queues `slide_deck_builds`
- Build status with loading spinner + step labels
- Index freshness: *"Library index updated …"*

**Advanced / troubleshooting (collapsed `<details>`):**

- Debug: `npm run slide-deck:apply` / `publish` commands
- Debug: `npm run slide-deck:agent` + token note
- Download manifest JSON
- Legacy `slide_deck_jobs` status (until removed)

**Emergency (visible):**

- Option C — upload `.proplaylist` for Drive publish

---

## Documentation updates

| Doc | Action |
|-----|--------|
| [HOSTING-GRAPEVINE.md](./HOSTING-GRAPEVINE.md) | Slide Deck section → point to platform PRD |
| [SLIDE-DECK-AGENT.md](./SLIDE-DECK-AGENT.md) | Add deprecation banner at top |
| [PROPRESENTER-PUBLISH.md](./PROPRESENTER-PUBLISH.md) | Hosted workflow → rig client primary |
| `.env.local.example` | Mark `SLIDE_DECK_AGENT_TOKEN` as debug-only |

---

## Developer / debug: interim agent

Still useful for engineering until Grapevine Rig ships:

```bash
cd church-planning-buddy
# .env.local: SLIDE_DECK_AGENT_TOKEN (must match Worker secret via npm run env:cf)
GRAPEVINE_PREP_URL=https://grapevineprep.com npm run slide-deck:agent
```

**Known issues (interim):**

- Shared token — not org-scoped; any agent claims any pending job
- No visible UI feedback when token mismatches (agent logs `Poll error`)
- Preview degrades without cloud index ("Library not scanned")
- Requires Node, repo clone, terminal literacy

Do **not** document this path for church operators.

---

## Timeline

| Milestone | Deprecation step |
|-----------|------------------|
| Phase 0 shipped | UI demotes A/B; queue `slide_deck_builds` |
| Phase 1 pilot | Grapevine Rig replaces agent in all operator docs |
| Phase 1 + 30 days | Remove agent panel from UI; archive `slide_deck_jobs` writes |
| Phase 2 | Remove `SLIDE_DECK_AGENT_TOKEN` from Worker (debug env only) |
