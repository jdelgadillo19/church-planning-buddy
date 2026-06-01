# ProPresenter sync — Epics & stories (Phase 1–2)

**Date:** 2026-06-01  
**Prerequisites:** [technical research](../../_bmad-output/planning-artifacts/research/technical-propresenter-sync-file-format-research-2026-06-01.md), [PROPRESENTER-SYNC-ARCHITECTURE.md](../PROPRESENTER-SYNC-ARCHITECTURE.md), [PROPRESENTER-SYNC.md](../PROPRESENTER-SYNC.md)  
**Sequencing:** Start after generation PR1 — [PROPRESENTER-SYNC-SEQUENCING.md](./PROPRESENTER-SYNC-SEQUENCING.md)

---

## Epic SYNC-1: Bundle snapshot & manifest (Phase 1)

**User value:** Operators can see a trustworthy inventory of the ProPresenter filebase without syncing or writing anything.

### Story SYNC-1.1 — Bundle root configuration

**As** a tech director  
**I want** CPB to know my ProPresenter support-files root  
**So that** scans target the correct library tree

**Acceptance criteria:**

- [ ] `PP_BUNDLE_ROOT` env var documented in `.env.local.example`
- [ ] CLI `pp:bundle-scan` fails with clear message if root missing or not a directory
- [ ] README notes operator must set path from ProPresenter → Advanced → Support Files

**Technical notes:** `src/lib/propresenter/bundle-sync/config.ts`

---

### Story SYNC-1.2 — Bundle scanner (read-only)

**As** an operator on the rig  
**I want** a read-only scan of Libraries and Playlists  
**So that** CPB can build a manifest without touching ProPresenter via destructive APIs

**Acceptance criteria:**

- [ ] Scanner walks `Libraries/**` and `Playlists/**` under bundle root
- [ ] Scanner excludes `Configuration/**`, `*.tmp`, cache/log patterns per architecture doc
- [ ] Each file record includes: `relativePath`, `size`, `mtime`, `sha256`
- [ ] Scan completes on operator bundle without throwing on permission errors (skip + warn)
- [ ] Unit tests use fixture tree (no real PP install required in CI)

**Technical notes:** `src/lib/propresenter/bundle-sync/scanner.ts`

---

### Story SYNC-1.3 — Snapshot persistence (rig-local)

**As** an operator  
**I want** named snapshots stored on the rig  
**So that** I can compare filebase state over time

**Acceptance criteria:**

- [ ] `BundleSnapshot` JSON schema versioned (`schemaVersion: 1`)
- [ ] Snapshots stored under `~/.cpb/propresenter/snapshots/{id}.json`
- [ ] Snapshot includes `createdAt`, `deviceLabel`, `bundleRoot`, `files[]`
- [ ] CLI `pp:bundle-scan --save <label>` writes snapshot and prints id
- [ ] CLI `pp:bundle-scan --list` lists snapshot ids and dates

**Technical notes:** `src/lib/propresenter/bundle-sync/snapshots.ts`

---

### Story SYNC-1.4 — Operator bundle validation checklist

**As** Jesse (operator)  
**I want** a documented checklist to run on the real rig  
**So that** research questions Q2, Q3, Q9–10 are validated with evidence

**Acceptance criteria:**

- [ ] Checklist added to research doc appendix or `docs/PROPRESENTER-SYNC-RIG-CHECKLIST.md`
- [ ] Includes: edit one song → rescan; copy one `.pro` backup/restore; `du` size breakdown
- [ ] Results captured in a dated comment or `docs/spikes/` note when run

**Technical notes:** Non-code; blocks Phase 4 promises only

---

### Story SYNC-1.5 — Optional cloud snapshot copy

**As** an operator  
**I want** to upload a snapshot metadata file to our church Drive folder  
**So that** remote editors know the rig baseline snapshot id

**Acceptance criteria:**

- [ ] Uses existing Google OAuth; new folder id env `PP_SYNC_DRIVE_FOLDER_ID`
- [ ] Uploads snapshot JSON only (no full bundle) to `/snapshots/`
- [ ] Fails gracefully if Google not connected

**Priority:** Should — can follow SYNC-1.3 in same PR or next

---

## Epic SYNC-2: Diff, classification & signoff UI (Phase 2)

**User value:** Operators see what would change, how risky it is, and approve push/pull before any apply.

**Depends on:** Epic SYNC-1 complete; generation PR1 shipped (sequencing doc)

### Story SYNC-2.1 — Snapshot diff engine

**As** an operator  
**I want** CPB to diff two snapshots  
**So that** I get a list of proposed file-level changes

**Acceptance criteria:**

- [ ] `diffSnapshots(a, b)` returns `SyncChange[]` with kinds: `file_add`, `file_update`, `file_delete` (path + hashes)
- [ ] Playlist-level changes deferred to SYNC-2.2 if not inferable from files alone
- [ ] Tests cover add/update/delete permutations on fixture trees

**Technical notes:** `src/lib/propresenter/bundle-sync/diff.ts`

---

### Story SYNC-2.2 — Change set builder + classification (hash rules)

**As** an operator staging changes  
**I want** each change set labeled simple / non_destructive / destructive / conflict  
**So that** I know what signoff UI to expect

**Acceptance criteria:**

- [ ] `SyncChangeSet` type matches architecture doc
- [ ] Classifier uses path rules: deletes → destructive; `Libraries/**` add → non_destructive; config paths → destructive
- [ ] Unknown paths → `conflict` (not silent simple)
- [ ] **Does not** require semantic/protobuf decode (Phase 4)
- [ ] Unit tests for each classification bucket

**Technical notes:** `src/lib/propresenter/bundle-sync/classify.ts`

---

### Story SYNC-2.3 — Push staging to Drive (metadata + blobs)

**As** a remote editor  
**I want** to upload a change set and referenced blobs  
**So that** the rig can review without Drive whole-bundle sync

**Acceptance criteria:**

- [ ] Change set JSON to `/change-sets/{serviceDate}-{id}.json`
- [ ] Blobs content-addressed at `/blobs/sha256/{hash}.{ext}`
- [ ] Dedup: do not re-upload identical hash
- [ ] `pushApproval` recorded with operator name + timestamp when non-simple

**Technical notes:** `src/lib/propresenter/bundle-sync/stage.ts`

---

### Story SYNC-2.4 — Rig review UI (read-only apply)

**As** a rig operator  
**I want** a page listing staged change sets with classification badges  
**So that** I can review before any apply exists

**Acceptance criteria:**

- [ ] Route e.g. `/propresenter/sync` lists pending change sets from Drive folder
- [ ] Detail view shows file list, classification, push approval metadata
- [ ] **No apply button** in this epic (Phase 3)
- [ ] Dry-run panel: missing blobs, conflict if rig snapshot newer than `baseSnapshotId`

**Technical notes:** `src/app/propresenter/sync/` — reuse GRG signoff visual patterns

---

### Story SYNC-2.5 — Push/pull signoff modals

**As** an operator  
**I want** confirmation modals matching classification  
**So that** non-simple changes require explicit approval on push and pull intent

**Acceptance criteria:**

- [ ] Simple: single “Stage” / “Approve pull intent” action
- [ ] Non-destructive: modal lists added/updated paths
- [ ] Destructive: red warning + file list (apply still disabled in Phase 2 — intent only)
- [ ] Records `pullApproval` on rig for audit when operator confirms review

---

### Story SYNC-2.6 — Audit log + operator selection

**As** a tech director  
**I want** who approved what recorded  
**So that** we can trace mistakes without full auth

**Acceptance criteria:**

- [ ] `operators.json` example in repo; loaded on rig
- [ ] Session start: pick operator + mode (Editing / Rehearsal / Live)
- [ ] Append audit entry on push signoff and pull intent signoff
- [ ] Log fields: changeSetId, classification, operators, devices, timestamps, snapshot ids

**Technical notes:** `src/lib/propresenter/bundle-sync/audit.ts`, `session.ts`

---

### Story SYNC-2.7 — Live lock / session status UI

**As** a rig operator  
**I want** a visible “rig in use” status  
**So that** remote editors know not to expect immediate apply

**Acceptance criteria:**

- [ ] Shows held-by, mode, since timestamp
- [ ] While `Live`: block pull intent or show strong warning (per product policy in PROPRESENTER-SYNC.md)
- [ ] Remote staging still allowed; UI shows “stage-only while live”

---

## Epic summary

| Epic | Stories | Phase |
|------|---------|-------|
| SYNC-1 | SYNC-1.1 – SYNC-1.5 | Phase 1 |
| SYNC-2 | SYNC-2.1 – SYNC-2.7 | Phase 2 |

**Out of this document (Phase 3+):** apply engine, restore points, semantic fingerprint — see architecture §8.

---

## Implementation readiness (Phase 2 gate)

Before starting SYNC-2.4 UI at scale:

- [ ] SYNC-1.3 snapshots exist on rig from real bundle
- [ ] Research operator checklist (SYNC-1.4) run or explicitly deferred with sign-off
- [ ] `PP_SYNC_DRIVE_FOLDER_ID` configured for church test folder
- [ ] Generation PR1 merged and demoed
