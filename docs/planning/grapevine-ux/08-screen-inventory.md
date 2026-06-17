# 08 — Screen inventory (implementation contract)

**How to add a row:** Every screen, modal, or persistent panel gets a stable `id`. Implementation plans and tickets reference `id`, not prose.

**Column guide:**

| Column | Purpose |
|--------|---------|
| `id` | Stable snake-case: `{surface}.{area}.{name}` |
| `route` | URL or rig screen |
| `roles` | Who can see it |
| `entry` | How user gets here |
| `elements` | Buttons, inputs, links (exact labels) |
| `primary_action` | Default / highlighted action |
| `api` | Endpoints or invoke commands |
| `next_states` | Where each action goes |
| `notes` | Edge cases |

---

## Global / hub

| id | route | roles | entry | elements | primary_action | api | next_states | notes |
|----|-------|-------|-------|----------|----------------|-----|-------------|-------|
| `hub.home` | `/` | member+ | sign in | Tool cards, Google card, Sign out | Open tool | — | tool.* | |
| `auth.login` | `/login` | all | redirect | Continue with Google | Sign in | Supabase | hub.home | |

_Add rows: `global.header`, `settings.shell`, etc._

---

## GRG

| id | route | roles | entry | elements | primary_action | api | next_states | notes |
|----|-------|-------|-------|----------|----------------|-----|-------------|-------|
| `grg.wizard` | `/grg` | planner+ | hub | _list steps_ | | | | |
| `grg.step.approve` | `/grg` | planner+ | preview ok | Approve and update, Skip intro… | Approve | apply-init… | success / error | |

---

## Slide deck (web)

| id | route | roles | entry | elements | primary_action | api | next_states | notes |
|----|-------|-------|-------|----------|----------------|-----|-------------|-------|
| `slide.main` | `/slide-deck` | planner+ | hub | Load plan, preview panel, hosted panel | Send to rig | mock-commit, builds | | |
| `slide.handoff_discovery` | `/slide-deck` | planner+ | select weekend | Weekend presentations list, download existing | Download existing | submissions?handoffsOnly=1 | slide.builder | green/yellow status |
| `slide.builder` | `/slide-deck` | planner+ | create or download | Create Presentation, review, Download | Create Presentation | mock-commit, apply | slide.upload | |
| `slide.upload` | `/slide-deck` | planner+ (local PP) | after download + edit | Upload complete/incomplete, Cancel | Upload complete | submissions POST, upload/scan | slide.handoff_discovery | prep machine only |
| `slide.merge_review` | `/slide-deck` | planner+ | send conflicts | Per-row source select | Confirm merge | submissions/merge | slide.main | |
| `slide.conflict.local_pp` | `/slide-deck` | planner+ | local apply preflight | Overwrite, View, Cancel | Overwrite | apply?resolution= | | remote prep |

---

## Grapevine Rig (desktop)

| id | route | roles | entry | elements | primary_action | api | next_states | notes |
|----|-------|-------|-------|----------|----------------|-----|-------------|-------|
| `rig.pair` | pair screen | admin | first launch | Code input, display name, Pair | Pair | pair API | rig.main | |
| `rig.main.idle` | main | operator | paired | Scan now, Unpair, no build message | — | poll builds | rig.main.build_ready | |
| `rig.main.build_ready` | main | operator | pending build | Apply Slide Deck, impl review | Apply | run_apply | applying / conflict | |
| `rig.handoff_pending` | main | operator | complete handoff queued | Import handoff, Skip | Import | run_handoff, handoffs/pending | staged import | Services/ package |
| `rig.main.failed` | main | operator | apply error | Retry apply, error text | Retry | run_apply | | |

---

## Settings (planned)

| id | route | roles | entry | elements | primary_action | api | next_states | notes |
|----|-------|-------|-------|----------|----------------|-----|-------------|-------|
| `settings.drive` | `/settings/drive` | admin | settings nav | _paste links, browse, save_ | Save | org/drive-settings | | deferred |
| `settings.rigs` | `/settings/rigs` | admin | settings nav | Add rig, rig list | Add rig | pairing-codes | | |
| `settings.members` | `/settings/members` | admin | settings nav | | | | | TBD |

---

## Modals / overlays (add as needed)

| id | parent | trigger | elements | actions | api |
|----|--------|---------|----------|---------|-----|
| _example_ | `slide.main` | missing songs | Block send message | Fix songs | — |

---

## Screen count checklist

- [ ] Every button in rig conflict has a row or explicit parent row
- [ ] Every wizard step has `grg.step.*` or `slide.step.*`
- [ ] Admin settings screens listed before auth implementation
- [ ] "Advanced / debug" collapsed sections documented (show/hide rules)
