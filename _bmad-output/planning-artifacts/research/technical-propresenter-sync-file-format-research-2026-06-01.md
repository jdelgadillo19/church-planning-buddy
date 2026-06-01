---
stepsCompleted: [init, overview, integration, patterns, synthesis]
research_type: technical
research_topic: ProPresenter 7/21 bundle file format and safe scoped sync for Church Planning Buddy
research_goals: Answer discovery questions from ProPresenter-sync-system-context-2026.06.01.md; go/no-go on semantic fingerprint timing
user_name: Jesse
date: 2026-06-01
web_research_enabled: true
source_verification: true
inputDocuments:
  - docs/user-feedback/context-convos/ProPresenter-sync-system-context-2026.06.01.md
  - docs/PROPRESENTER-MVP.md
  - docs/PROPRESENTER-API-SPIKE.md
---

# Technical Research: ProPresenter file format and safe scoped sync

**Date:** 2026-06-01  
**Project:** Church Planning Buddy  
**Author:** Jesse (BMAD technical research workflow)  
**Status:** Synthesis complete — operator rig validation still required for Q9–10 (bundle size)

---

## Executive summary

ProPresenter 7+ stores presentations, playlists, and most configuration as **Google Protocol Buffer** binaries, not human-readable XML (Pro6). Semantic fingerprinting is **feasible in principle** by decoding `.pro` and related files with community `.proto` definitions ([greyshirtguy/ProPresenter7-Proto](https://github.com/greyshirtguy/ProPresenter7-Proto)), but **not recommended for CPB Phase 2**. Use **file-level hashes + API-readable metadata** for Phases 1–3; defer arrangement/lyric-level fingerprints to **Phase 4** after an operator-bundle spike with `protoc` on real `.pro` files.

**Single-file copy/apply** is a supported real-world pattern (manual backups, ProPresenter import/export, library restore guides) but CPB must **never hot-swap files while ProPresenter is running** and must treat index/cache folders as **read-only or exclude** from sync.

**Go/no-go:** Semantic fingerprint → **Phase 4 only** (not Phase 2). Phase 2 classification uses path category, size/hash delta, and API snapshot where available.

---

## Methodology

- Reviewed CPB context doc open questions (lines 627–640)
- Reviewed existing CPB spike: Local API 21.3, library enumeration, no arrangement write APIs
- Web research: GreyShirtGuy reverse-engineering series, ProPresenter7-Proto, Pro7-Media-Sweeper path conventions, official recovery/import guidance
- Cross-checked with CPB `src/lib/propresenter/safety.ts` (library writes blocked)

**Gap:** No direct access to operator Google Drive bundle or rig disk in this session. Size questions (Q9–10) marked **operator action required**.

---

## Findings by discovery question

### Q1: Are song/presentation files structured enough for semantic fingerprinting?

| Evidence | Assessment |
|----------|------------|
| Pro7 `.pro` files are protobuf `rv.data.Presentation` messages | **Yes, structured** — not opaque binary blobs |
| Unofficial `.proto` + `protoc --decode` yields JSON-like text with arrangements, groups, cues | **Parseable** for lyric hashes, arrangement names, group order |
| ProPresenter 21.3 may extend messages; protos are unofficial | **Risk:** schema drift; treat decode as best-effort |
| CPB already reads `presentation.arrangements`, `groups` via Local API | **Partial semantic layer without file decode** for live rig |

**Answer:** Structured enough for semantic fingerprinting **if** CPB adopts protobuf decode (Node: `protobufjs` + vendored protos) or a small rig-side helper CLI. Not required for MVP manifest/diff.

**Recommendation:** Phase 1–3 use **SHA-256 file hash + path category + API UUID**; Phase 4 add `PresentationContentFingerprint` from decoded `.pro` or API+file hybrid.

Sources: [ProPresenter 7 File Format Part 1](https://greyshirtguy.com/blog/pro7fileformat1/), [Part 2](https://greyshirtguy.com/blog/propresenter-7-file-format-part-2/), [ProPresenter7-Proto](https://github.com/greyshirtguy/ProPresenter7-Proto)

---

### Q2: When a song is manually edited, one file, multiple files, or database too?

| Change type | Likely storage behavior |
|-------------|-------------------------|
| Edit presentation (lyrics, slides, arrangements) | Primary: **one `.pro` file** under `Libraries/` (per library layout) |
| Playlist order / service deck | **Playlist document** under `Playlists/` (separate protobuf) |
| Media references | **Media files** on disk + paths embedded in `.pro`/playlists |
| App indexes / cache | Additional support files; ProPresenter may rebuild indexes on launch |

**Answer:** Manual song edits predominantly update **the presentation `.pro` file**; playlist files change when playlist membership/order changes. Expect **side effects** in indexes/cache — CPB must not sync cache folders as authoritative payloads.

**Operator validation:** Edit one song on rig → run bundle scanner → confirm which paths changed (Phase 1 spike script).

Sources: [Pro7-Media-Sweeper](https://github.com/arlinsandbulte/Pro7-Media-Sweeper) path layout; recovery guide on structured library bundles

---

### Q3: Can the rig safely import/apply a single changed song/presentation without replacing the whole library?

| Factor | Assessment |
|--------|--------------|
| Manual copy of single `.pro` reported working by operator | **Likely yes** when ProPresenter is **quit**, file is copied into correct library folder, app restarted |
| Official guidance favors **import/export** and **full library restore** for integrity | Prefer **ProPresenter Import** or controlled file copy over Drive mirror |
| Local API | **No** confirmed public endpoint for single-file library overwrite; file-level apply is the practical path |
| Risk | Wrong library folder, UUID collision, stale playlist references |

**Answer:** **Yes with guardrails** — single-file apply is viable for Phase 3 additive and Phase 4 proven-safe overwrites, not for whole-tree sync. CPB apply flow: restore point → quit PP (or block via live lock) → copy staged blob to relative path → relaunch → verify via API enumeration.

**Answer:** **No** to whole-library replace (retire external Drive mirror).

---

### Q4: Content payloads vs indexes/cache/support files

Typical Pro7 layout (macOS defaults; paths vary by “Support Files” preference):

| Path (relative to bundle root) | Role | CPB sync policy |
|--------------------------------|------|-----------------|
| `Libraries/**` | Presentation `.pro` payloads | **Stage/diff** (primary) |
| `Playlists/**` | Playlist protobuf documents | **Stage/diff** (service decks) |
| `Media/**` or external media root | Binary assets (video, images, audio) | **Blob store** (hash-addressed) |
| `Configuration/**` | Props, workspace, stage, looks, etc. | **Exclude v1** unless explicitly CPB-owned |
| Indexes, caches, logs, temp | Support | **Exclude always** — never upload/download as sync payload |

**Answer:** Sync only **Libraries**, **Playlists**, and **referenced Media blobs**. Exclude configuration and cache unless a future story explicitly scopes a CPB-owned config artifact.

Sources: Pro7-Media-Sweeper; [recovery guide](https://propresenter7.com/guide/how-do-i-recover-lost-or-deleted-presentations-in-propresenter/)

---

### Q5: Which categories should be CPB-managed vs protected?

| Category | CPB-managed (v1) | Protected (human/library) |
|----------|------------------|---------------------------|
| CPB-generated service playlists / presentations | Yes (create new; stage deltas) | — |
| Staged service assets (graphics, sermon deck for one date) | Yes (additive) | — |
| Master song database / canonical lyrics | — | Yes — destructive if Master changes |
| Archive sermon series folders | — | Yes — delete only via Phase 5 / archive workflow |
| Template countdown / standard cues | Read-only reference | Do not alter internals (PROPRESENTER-MVP) |
| `[LIVE]` arrangement for service songs | Stage overwrite if semantic proof (Phase 4) | Default protected until proven |

Aligns with context doc ownership boundaries.

---

### Q6: Should lyric text changes always be destructive?

**Recommendation:** Treat **Master lyric text changes** as **destructive/protected** always. Allow **LIVE-only lyric drift** only with **elevated signoff** (non-destructive + explicit list) once Phase 4 semantic diff proves Master unchanged. Default unknown → **conflict / needs review**.

---

### Q7: Deletes of old sermon series — sync or separate workflow?

**Recommendation:** **Separate archive/cleanup workflow** (Phase 5), not part of routine service sync. Routine change-sets should not include bulk series deletes without destructive classification and rig-only approval. Prevents “sync” from becoming “library janitor.”

---

### Q8: `[LIVE]` overwrite only for current-service songs?

**Recommendation:** **Yes for v1 policy** — scope non-destructive LIVE overwrites to presentations **referenced by the active service change-set** (playlist manifest). Blocks accidental library-wide LIVE propagation.

---

### Q9–Q10: Bundle size and largest storage offenders

**Status:** **Operator action required.**

Suggested rig script (Phase 1):

```bash
# Example: summarize bundle under PP support path
du -sh ~/Documents/ProPresenter/* 2>/dev/null | sort -hr | head -20
find ~/Documents/ProPresenter -type f \( -name '*.mp4' -o -name '*.mov' -o -name '*.pro' \) -print0 | xargs -0 du -ch | tail -1
```

**Hypothesis (industry typical):** Video/sermon motion graphics dominate bytes; `.pro` files dominate **change frequency**; media dominates **blob storage cost**.

---

### Q11: Restore point retention

**Recommendation (v1 defaults):**

| Type | Retention |
|------|-----------|
| Per pull/apply restore point | Last **10** per rig, min **30 days** |
| Destructive-change backups | **90 days** |
| Unreferenced staged blobs (cloud) | **14 days** GC |

Configurable via `operators.json` / church settings later.

---

### Q12: Notifications priority

| Priority | Event |
|----------|-------|
| P0 | Destructive change staged; live lock active while pull pending |
| P1 | Pull applied; conflict blocking apply |
| P2 | Non-destructive staged push (rig digest) |
| P3 | Simple playlist sync completed |

v1: in-app rig UI + optional email/Slack later — no WhatsApp replacement required day one if session lock UI is clear.

---

## Go/no-go: semantic fingerprint timing

| Phase | Semantic fingerprint | Rationale |
|-------|---------------------|-----------|
| Phase 1 (snapshot/manifest) | **No** — file hash + metadata only |
| Phase 2 (diff/classification UI) | **No** — hash + path rules + API UUID; unknown → `conflict` |
| Phase 3 (additive apply) | **No** — additive files don't need lyric diff |
| Phase 4 (safe overwrite) | **Yes** — required to prove Master/lyrics unchanged |
| Phase 5 (destructive delete) | Partial — file-level sufficient; semantic optional |

**Decision:** **GO for Phase 4** engineering spike (`protoc` on 3 golden `.pro` files from operator). **NO-GO for Phase 2** dependency on semantic decode.

---

## Operator validation checklist (next rig session)

1. Record actual bundle root path from ProPresenter → Advanced → Support Files.
2. Run directory size breakdown (Q9–10).
3. Edit one song → rescan → list changed paths (Q2).
4. Copy one `.pro` to backup and restore while PP quit (Q3).
5. Decode one `.pro` with [ProPresenter7-Proto](https://github.com/greyshirtguy/ProPresenter7-Proto) and confirm `arrangements` / lyric fields visible (Q1).

---

## Citations

1. GreyShirtGuy, “ProPresenter 7 - File Format, Part 1” — https://greyshirtguy.com/blog/pro7fileformat1/
2. GreyShirtGuy, “ProPresenter 7 - File Format, Part 2” — https://greyshirtguy.com/blog/propresenter-7-file-format-part-2/
3. greyshirtguy/ProPresenter7-Proto — https://github.com/greyshirtguy/ProPresenter7-Proto
4. arlinsandbulte/Pro7-Media-Sweeper — https://github.com/arlinsandbulte/Pro7-Media-Sweeper
5. ProPresenter recovery guide — https://propresenter7.com/guide/how-do-i-recover-lost-or-deleted-presentations-in-propresenter/
6. CPB internal: `docs/PROPRESENTER-API-SPIKE.md`, `src/lib/propresenter/safety.ts`
