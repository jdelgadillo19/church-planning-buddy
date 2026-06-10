# Startup prompt — next Cursor session

**Slide deck / Grapevine Prep / rig:** use **[`STARTUP-GUIDE.md`](./STARTUP-GUIDE.md)** instead — it has the current deploy state, Sunday workflow, and a fresher Cursor prompt.

Copy the block below into a new chat when resuming **GRG wizard** work on Church Planning Buddy.

---

```
I'm continuing work on Church Planning Buddy (church-planning-buddy/).

Read these first (in order):
1. docs/STARTUP-PROMPT.md (this file)
2. docs/PROJECT-STATUS.md
3. docs/PROPRESENTER-MVP.md

Context:
- GRG MVP is shipped: PCO plan → Drive scan resolution → copy GRG template → dated output doc → signoff. Song scan retrieval is in good shape (plans 87788328 intro, 87788327 scan edge cases).
- Product direction pivoted (2026-05-24 party mode): next epic is **Service deck assembly** — PCO + Get Ready Guide (or selected reference) → **ProPresenter 21.3** playlist in a **new presentation**, with preview/signoff before any ProPresenter writes.
- Outcome we're aiming for: "I only have to plan once, then everything's basically automatic" at the **playlist** layer; manual arrangement tile work is an explicit exception when API can't reorder tiles.

ProPresenter 21.3 Local API (already verified on operator Mac):
- Playlist create: YES
- Arrangement tile reorder: NO (no documented API)
- Library: enumerate/query YES; native full-text search NO → CPB builds a local library index
- Architecture: ProPresenter = content source + playlist sink; CPB = search + match + signoff intelligence
- Safety: never wipe/replace filebase; always create new presentation; never touch unrelated week’s files. Rig has known filebase wipe bug — avoid destructive sync paths.

MVP scope highlights (see PROPRESENTER-MVP.md):
- Primary focus: song selection + service order + template cue presence (don't alter actions/media on non-lyric items)
- PCO wins order/metadata; GRG wins lyric structure for matching
- Match library songs (title, lyrics, CCLI); prefer LIVE arrangement when structure matches; else flag NEEDS_ARRANGEMENT
- Reference doc: detect/select existing GRG or run GRG apply; manual steps OK for debugging
- 8-week out of scope: SMS bot, extra integrations, Ableton SOT

NEXT TASK (suggested): Phase 0 done on operator Mac (TCP port 64509, PP_TRANSPORT=tcp). Start PR1: worship-plan manifest + dry-run preview (no ProPresenter writes). See docs/PROPRESENTER-API-SPIKE.md.

Repo: https://github.com/jdelgadillo19/church-planning-buddy
Do not edit .cursor/plans/ unless I ask.

[Your task here]
```

---

**Last updated:** 2026-05-24
