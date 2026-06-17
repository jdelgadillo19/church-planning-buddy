# Grapevine UX specification (starter template)

**Status:** Draft — fill in before sitewide UX implementation  
**Audience:** Product owner + implementers (human and AI)

This folder is the **canonical UX source** for Grapevine Prep (web) and Grapevine Rig (desktop). Implementation plans (auth, Drive settings, rig conflict, M3 publish) should **reference screen IDs** from [`08-screen-inventory.md`](./08-screen-inventory.md), not reinvent flows.

---

## How to use this pack

1. Fill **`01-information-architecture.md`** first (who sees what URLs).
2. Fill **`02-global-chrome.md`** (header, hub, settings shell).
3. Draw workflows in **`03`–`07`** (one lane per file). Use mermaid; label every node with **Actor · Surface · Outcome**.
4. Register every screen/modal in **`08-screen-inventory.md`** (stable `id` per row).
5. Cross-cutting loading/empty/error patterns in **`09-states-errors-empty.md`**.
6. When a lane is “good enough,” open a Cursor implementation plan that links here.

**Do not delete example rows** until you replace them with your final design — they show the level of detail needed for implementation.

---

## Surfaces

| Surface | Codebase | Notes |
|---------|----------|--------|
| Web hub | `src/app/page.tsx`, `src/lib/tools/registry.ts` | Tool cards |
| GRG | `src/app/grg/page.tsx` | Multi-step wizard |
| Slide deck | `src/app/slide-deck/page.tsx`, `slide-deck-hosted-panel.tsx` | Web + hosted rig queue |
| Messaging | `src/app/messaging/page.tsx` | |
| Settings | *planned* `/settings/*` | Admin / org config |
| Grapevine Rig | `apps/grapevine-rig/frontend/` | Tauri operator client |

---

## Glossary (edit as needed)

| Term | Meaning |
|------|---------|
| **Planner** | `org_members.role` = `planner` or `admin`; builds plans in browser |
| **Admin** | `admin`; org settings, rig pairing |
| **Operator** | `operator`; presentation rig only (apply, scan) |
| **Viewer** | `viewer`; TBD access |
| **Filebase** | ProPresenter libraries/playlists on Shared Drive (`Filebase/`) |
| **Service package** | Week handoff under `Services/{date}/` |
| **Implementation plan** | Merged playlist rows on `slide_deck_builds` — what rig applies |
| **Browser planner** | grapevineprep.com — preview/submit without local PP; Send to rig |
| **Remote prep device** | Volunteer machine with local ProPresenter; upload handoff — not a presentation rig |
| **Presentation rig** | Sanctuary machine + Grapevine Rig; hosts filebase; Scan now + apply authority |
| **Local PP connected** | Technical ping only — not a product role (`device-context.ts`) |

Device capability matrix: [filebase-architecture.md](../filebase-architecture.md#device-roles-in-code).

---

## Related docs

- [filebase-architecture.md](../filebase-architecture.md)
- [SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md](../SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md)
- [org-drive-settings-ui.md](../org-drive-settings-ui.md) (deferred)
- [rig-playlist-conflict-ux.md](../rig-playlist-conflict-ux.md) (deferred)
