# ProPresenter Sync System Context - 2026-06-01

Purpose: reference context for a Cursor-initiated BMad party/planning session.

This document captures the conversation about replacing the current external ProPresenter Google Drive sync workflow with a safer Church Planning Buddy-managed staging, approval, and sync system.

## Initial User Context

The user asked to look at `church-planning-buddy` and think through the push-to-sync system for the ProPresenter slide deck generator tool.

The current real-world workflow, outside Church Planning Buddy, is:

- The whole ProPresenter filebase/bundle is stored on Google Drive.
- A presentation rig and remote editing devices both have access to that same Drive-backed filebase.
- When either device makes local changes, local ProPresenter docs are rigged to sync periodically to Google Drive.
- On startup, Google Drive syncs and overwrites the local drive.
- Sync happens automatically on device startup with no signoff checks.
- This has caused situations where the entire filebase gets wiped and replaced with blank defaults.

The desired replacement should:

- Use less storage.
- Not be capable of wiping the whole database.
- Add and edit existing files.
- Include a signoff layer on both push and pull.
- Remain low-input and mostly automated, but not fully automatic.

There is also a current manual safety workaround:

- On the presentation rig, opening ProPresenter from desktop launches a CLI popup.
- The popup warns the user to ensure sync has happened.
- It also warns users to post/check a WhatsApp channel stating that ProPresenter is in use.
- This applies to both the presentation rig and remote editing devices.
- The user considers this a low-quality temporary fix and wants a better system.

## Important Clarification

The user stopped the initial investigation to clarify:

The described "right now" sync state has nothing to do with Church Planning Buddy. It is not how CPB is implemented. It is simply the external workflow that CPB is intended to replace.

The user does not have further technical context for the current external setup because it exists on separate devices. The only access available is that the user's Google Drive account has access to the sync drive.

## Current CPB Direction

The prior CPB ProPresenter MVP direction already says:

- CPB should generate a ProPresenter playlist/presentation from Planning Center and a Get Ready Guide/reference doc.
- CPB should create a new presentation/playlist, not overwrite existing week files.
- CPB should preview and require explicit signoff before ProPresenter writes.
- ProPresenter should be treated as content source and playlist sink.
- CPB should avoid destructive sync paths and never wipe/replace the filebase.

The important refined rule:

> CPB should not sync the ProPresenter filebase as a whole.

The current Drive filebase sync should be treated as an external hazard to retire, not as a system to integrate with directly.

## Proposed Core Model

Instead of syncing the whole ProPresenter bundle, CPB should use a staging and approval system:

```text
PCO + GRG + ProPresenter library index
        ↓
CPB manifest / build report
        ↓
Human signoff
        ↓
Generated service deck package or playlist intent
        ↓
Human signoff on presentation rig
        ↓
Apply to ProPresenter as a new playlist/presentation or scoped file changes
```

The north-star rule:

> CPB may create or stage new service-specific artifacts, but it must never mirror, replace, or synchronize the ProPresenter filebase as a whole.

Remote devices may prepare and stage changes. The presentation rig is the trusted apply authority.

```text
Remote/editor device:
- build playlist
- add files
- prepare change set
- push/stage with confirmation

Presentation rig:
- sees staged change
- reviews classification
- approves pull/apply
- creates restore point
- writes to local ProPresenter files/API
```

## Caveat: Real-World Manual Editing Must Be Supported

The user added that the real workflow includes cases like:

- A song is missing from the database.
- Lyrics need to be edited.
- A service has live sermon slides instead of a video.
- A new sermon series requires a new set of graphics and slides.

Ultimate desired workflow:

1. Use CPB to build the presentation.
2. Go into ProPresenter and make manual changes, such as adding a new song or reordering an arrangement.
3. Upload/sync the playlist and the new elements that need to be synced.
4. Log changes based on who makes them.
5. Use signoffs and notifications when new syncs happen.
6. Preserve accountability when mistakes occur.

This means CPB should not merely do one-way generation. It needs to support planned deltas against a known ProPresenter content world.

## Change Set Model

The key object is a change set, not the whole filebase.

```ts
type SyncChangeSet = {
  id: string;
  serviceDate: string;
  author: string;
  createdAt: string;
  sourceDevice: string;

  baseSnapshotId: string;
  changes: SyncChange[];

  classification: "simple" | "non_destructive" | "destructive" | "conflict";
  pushApproval?: Approval;
  pullApproval?: Approval;
};
```

Possible changes:

```ts
type SyncChange =
  | { kind: "playlist_order_update"; playlistId: string; items: PlaylistItemRef[] }
  | { kind: "playlist_create"; playlistName: string; items: PlaylistItemRef[] }
  | { kind: "file_add"; path: string; size: number; hash: string; blobRef: string }
  | { kind: "file_update"; path: string; beforeHash: string; afterHash: string; blobRef: string }
  | { kind: "file_delete"; path: string; beforeHash: string }
  | { kind: "arrangement_update"; presentationId: string; arrangementName: string; beforeHash: string; afterHash: string };
```

## Signoff Categories

The user proposed:

- Simple playlist reorientation should not need signoff beyond clicking "sync."
- Non-destructive changes, such as adding new files or changing song order, should show a confirmation popup that lists files being added.
- Destructive changes, such as deleting old sermon series slides, should show a similar signoff window with explicit red warning text and a list of files to be removed.
- These warnings should happen at both push and pull stages.

Refined categories:

### Simple

Examples:

- Playlist order.
- Playlist membership.
- Service-specific arrangement selection.
- CPB-created playlist metadata.

Action:

- No modal beyond "Sync" or a lightweight confirmation.

### Non-Destructive

Examples:

- Adding files.
- Adding new sermon graphics.
- Adding a new song presentation.
- Updating a non-master arrangement if protected content is proven unchanged.
- Adding sermon slides.
- Creating a new series folder.

Action:

- Confirmation modal listing added/updated files and affected items.

### Destructive

Examples:

- Deleting old sermon series files.
- Replacing existing master files.
- Removing library presentations.
- Deleting folders.
- Overwriting anything not clearly CPB-owned.
- Changing Master arrangement, master lyrics, or protected canonical song content.

Action:

- Red warning.
- Explicit approval on push and pull.
- Possibly require typing `DELETE` or checking "I understand these files will be removed."

### Conflict

Example:

- A remote device created a change set from snapshot A, but the rig is now on snapshot B.
- Someone changed the same song on the rig after the remote change set was prepared.

Action:

- Must review.
- No blind apply.

## Manifest Database Instead of Skeleton Tree

The user suggested a skeleton file tree with filenames only to reduce space.

The refined recommendation is a manifest database rather than a filename-only skeleton.

Manifest should store:

```text
relative path
file type/category
size
modified time
content hash
optional ProPresenter UUID
optional playlist/library membership
optional owner/source
```

Why not filename-only:

- Same filename can contain different content.
- CPB needs to distinguish "same file" from "same name, changed content."
- Hashes are cheap and solve this.

Cloud storage shape:

```text
/change-sets/2026-06-07-service.json
/blobs/sha256-abcd1234.pro
/blobs/sha256-efgh5678.png
/snapshots/rig-main-2026-06-01.json
```

Only changed blobs/assets should be uploaded.

## Semantic Fingerprinting

The user wondered whether file hashes could expand to include lyric contents, slide placements, utilized assets, slide behavior, etc.

Recommendation:

Use three layers:

```text
1. File manifest
   path, size, modified time, full file hash

2. Semantic fingerprint
   lyric text hash
   master arrangement hash
   LIVE arrangement hash
   slide group/order hash
   media reference hash
   action/behavior hash
   theme/template reference hash

3. Optional payload blobs
   only uploaded when the actual changed file or asset is needed
```

Layer 1 catches "anything changed."

Layer 2 enables safe classification:

```text
Did the file change?
Did lyrics change?
Did only arrangement order change?
Did media assets change?
Did slide actions/timers/macros change?
Is this safe to apply automatically?
Does the rig already have every referenced asset?
```

Layer 3 stores changed payloads only when needed.

The main win is not only storage. The main win is control and explainability.

Raw sync says:

```text
Here is a folder. Make yours match it.
```

CPB sync says:

```text
Here are 7 proposed changes:
- 1 playlist reorder
- 2 new graphics
- 1 new sermon deck
- 1 LIVE arrangement update
- 2 deletions

These are safe / these need approval / these are dangerous.
```

## Arrangement Overwrite Discussion

The user clarified that the goal is not necessarily to edit arrangements through the API directly.

Instead:

- A human may manually change the arrangement in ProPresenter.
- CPB may then use that modified song/presentation file as an overwrite/import source elsewhere.
- If the Master arrangement is untouched, this could count as non-destructive even though an overwrite step is technically used.
- If anything changes the Master arrangement, that is destructive.

Refined rule:

> Classify by what changed, not by whether the transport mechanism uses an overwrite.

Examples:

```text
Overwrite song file, but Master arrangement + lyrics + media/actions unchanged
→ non-destructive arrangement sync

Overwrite song file, and Master arrangement changed
→ destructive/protected

Overwrite song file, and lyrics text changed
→ destructive/protected, or at least content-edit signoff

Overwrite song file, and only [LIVE] arrangement changed
→ non-destructive with confirmation
```

Hard requirement:

CPB must be able to prove protected parts are unchanged.

A plain file hash is not enough because any arrangement change alters the whole file hash. CPB needs a semantic diff or trusted extracted manifest from the song file.

Example fingerprint:

```ts
type PresentationContentFingerprint = {
  presentationId: string;
  fileHash: string;
  masterArrangementHash: string;
  lyricTextHash: string;
  mediaActionHash: string;
  arrangements: {
    name: string;
    hash: string;
    groupOrderHash: string;
  }[];
};
```

Then CPB can say:

```text
File changed: yes
Master changed: no
Lyrics changed: no
Actions/media changed: no
LIVE arrangement changed: yes
```

If CPB cannot prove those protected fields are unchanged, it should escalate to "needs review" rather than silently treat the change as non-destructive.

Final arrangement rule:

> An overwrite can be non-destructive when CPB can prove the protected parts of the file are unchanged.

## ProPresenter API Arrangement Caveat

Based on current CPB spike notes:

- The public API exposes presentation reads such as `GET /v1/presentation/{uuid}`.
- It exposes arrangement-related data such as `presentation.arrangements`, `presentation.current_arrangement`, and `presentation.groups`.
- There is no confirmed public API endpoint for arrangement create, duplicate, overwrite, or tile reorder.
- There may be a way to select an existing arrangement when adding a playlist item, because playlist payloads include fields like `arrangement_name`.
- Directly editing or reordering arrangement tiles remains unconfirmed and should not be assumed.

Therefore:

- CPB should not rely on API-driven arrangement editing for MVP.
- Manual ProPresenter editing followed by file-level or package-level diff/import may be the practical path.
- Non-master arrangement overwrite can be considered non-destructive only if semantic diff proves Master and protected content are unchanged.

## Rig as Apply Authority

The user answered key questions:

1. The current external sync is the entire ProPresenter bundle.
2. The user thinks individual files are likely inspectable/copyable because manual backups and copies worked without issue.
3. There is currently no signoff.
4. Desired behavior: approval only truly matters on the presentation rig.
5. Anyone who knows the password to the presentation rig is accountable for mistakes.
6. The rig itself has permission to approve.
7. A pseudo-sublogin on the rig could help incident tracking, but may not be strictly necessary.

Recommendation:

The presentation rig should be the trusted apply authority.

Remote devices may stage changes. Only the rig approves pull/apply.

For v1, full user auth is probably unnecessary. A lightweight operator prompt is enough:

```text
Who is using ProPresenter?
[ Josh        v ]

Mode:
[ Editing ] [ Rehearsal ] [ Live ]

Start session
```

Audit logs should record:

```text
approvedBy: "Josh"
approvedOnDevice: "Presentation Rig"
timestamp
changeSetId
classification
```

This is not a security system. The Mac login remains the real gate. CPB's operator selection is for accountability and incident tracking.

Store known operators locally at first:

```text
operators.json
- Josh
- Tech Lead
- Sunday Volunteer
```

## Replacement for WhatsApp/CLI Warning

The WhatsApp/CLI warning is solving two problems:

1. Presence/lock: Is ProPresenter currently in use?
2. Change approval: Is it safe to update/import anything?

CPB should replace this with a lightweight session/live lock:

```text
Status: Presentation Rig In Use
Held by: Josh / Sunday operator
Since: 09:12
Mode: Live / Rehearsal / Editing
Remote changes: blocked or stage-only
```

Remote devices can still prepare/stage changes while the rig is live, but cannot directly apply to the rig.

The rig should show staged updates and require local approval.

Possible policy:

- While `Live`: block pulls or allow only explicit emergency pull with strong warning.
- While `Rehearsal`: allow non-destructive pull with warning.
- While `Editing`: allow normal pull/apply.

## Other Important Considerations

### Rollback

Every pull/apply should create a restore point first, including "non-destructive" changes.

If the rig imports a bad song file, CPB should provide a one-click restore for the previous version of affected files/playlist state.

### Ownership Boundaries

CPB needs to know what it is allowed to manage:

```text
CPB-owned generated playlists
CPB-staged service assets
Human-owned library/master song database
Archive-only old series folders
```

Explicit boundaries reduce guessing.

### Conflict Detection

If remote builds from snapshot A but the rig is now on snapshot B, CPB should pause.

Message:

```text
Rig changed since this sync was prepared.
Review required before applying.
```

### Trust Levels

Future permissions could be:

```text
Tech director: approve destructive changes
Worship leader: stage playlist/song changes
Volunteer: generate preview only
Presentation rig: final pull approval
```

For v1, device authority plus operator name is likely enough.

### Import Dry Run

Before applying a pull, CPB should simulate:

```text
All referenced files present?
Any missing assets?
Any protected files touched?
Any deletes?
Any conflicts?
Enough disk space?
```

### File Format Reality

Need to verify whether ProPresenter files can be semantically inspected reliably.

If structured/plist/json-ish, semantic fingerprints are feasible.

If opaque/binary, CPB may need a weaker model:

- File hash.
- API-readable presentation details.
- Conservative classification.

### Audit Trail

Every change set should record:

```text
who staged it
who approved push
who approved pull
device names
timestamps
files changed
classification
before/after snapshot IDs
```

### Garbage Collection

If staging changed blobs in Drive, use retention rules:

```text
keep last N service restore points
keep destructive-change backups longer
archive old sermon-series assets intentionally
delete unreferenced blobs after X days
```

### Naming and Identity

Do not rely only on filenames.

Track:

- ProPresenter UUIDs where available.
- Content hashes.
- Playlist IDs.
- Relative paths.
- Human-friendly names.

Filenames are helpful but not trustworthy enough by themselves.

## Questions Already Answered

### What exact folders/files are currently synced?

Answer:

The entire ProPresenter bundle.

Implication:

This confirms the current system is dangerous and should be replaced rather than refined.

### Can single ProPresenter files be copied/backed up safely?

Answer:

Likely yes. The user has created manual backups and copies without issue.

Implication:

This supports an MVP path that snapshots/indexes the bundle and stages individual changed files/assets.

### Who can approve destructive changes?

Answer:

For now, the presentation rig itself is the authority. Anyone with access to the rig password is accountable.

Possible v1:

- No full auth system.
- Use a pseudo-sublogin/operator selection for audit logs.

## Remaining Questions for Planning

These questions still need answering during discovery/spike:

1. Are ProPresenter song/presentation files structured enough for semantic fingerprinting?
2. When a song is manually edited, does ProPresenter update one `.pro` file, multiple files, or a database/index too?
3. Can the rig safely import/apply a single changed song/presentation file without replacing the whole library?
4. Which ProPresenter folders/files are content payloads versus indexes/cache/support files?
5. Which file categories should be CPB-managed versus protected?
6. Should lyric text changes always be destructive, or can some be allowed with elevated signoff?
7. Is deleting old sermon series content a sync operation or a separate archive/cleanup workflow?
8. Should overwriting `[LIVE]` arrangements be allowed only for songs used in the current service?
9. How large is the current synced bundle?
10. What are the largest storage offenders: videos, sermon graphics, song files, imported slide decks?
11. How long should restore points be retained?
12. Which notifications matter most: staged push, pull applied, destructive requested, live lock active?

## Recommended Phase Plan

### Phase 1: Snapshot/Manifest Only

- Add local ProPresenter bundle scanner.
- Produce manifest of files, sizes, modified times, hashes, and relative paths.
- Store snapshots.
- No writes.
- No cloud apply.

### Phase 2: Change-Set Classification and Signoff UI

- Compare two snapshots.
- Classify simple/non-destructive/destructive/conflict.
- Add push/pull confirmation UI.
- Add audit log structure.

### Phase 3: Additive Assets and Playlist Manifests

- Stage additive files and playlist manifests.
- Rig pulls staged changes.
- Rig creates restore point.
- Apply only additive/simple changes.

### Phase 4: Safe Overwrite with Semantic Diff

- Inspect ProPresenter files semantically if possible.
- Allow non-master arrangement overwrites only when protected content is proven unchanged.
- Escalate unknowns to review.

### Phase 5: Destructive Deletes and Cleanup

- Role/device gated approval.
- Red warning UI.
- Restore points mandatory.
- Possibly separate archive/cleanup workflow.

## Suggested BMad Party Prompt

```text
We are planning a safer ProPresenter sync/replacement system for Church Planning Buddy.

Context:
- Current external workflow syncs the entire ProPresenter bundle through Google Drive across the presentation rig and remote editing devices.
- This has caused catastrophic wipe/replacement incidents when blank defaults sync over the real filebase.
- This current sync system is NOT part of Church Planning Buddy. It is the unsafe workflow CPB should replace.
- CPB already has ProPresenter playlist generation work underway, using PCO + GRG/reference docs + ProPresenter Local API.

Goal:
Design a lean CPB-managed staging/push/pull system that:
- Never syncs or replaces the whole ProPresenter bundle.
- Uses snapshots/manifests/change sets.
- Allows remote devices to stage changes.
- Allows only the presentation rig to approve/apply pulls.
- Classifies changes as simple, non-destructive, destructive, or conflict.
- Requires signoff on push and pull for non-simple changes.
- Provides audit logs and restore points.
- Eventually supports safe overwrites where semantic diff proves protected content is unchanged.

Important user decisions:
- The current external sync is the entire ProPresenter bundle.
- Manual file backups/copies appear to work.
- The presentation rig is the trusted apply authority.
- Full user auth is not required for v1; a lightweight operator selection on the rig is probably enough for accountability.
- A `[LIVE]` arrangement overwrite can be considered non-destructive if CPB can prove Master arrangement, lyrics, media/actions, and other protected content are unchanged.
- Master content changes are destructive/protected.

Key planning outputs needed:
1. Product workflow for remote staging and rig-side approval.
2. Technical architecture for snapshots, manifests, change sets, blobs, restore points, and audit logs.
3. Safety model and classification rules.
4. Discovery/spike plan for ProPresenter file format and safe single-file import/apply.
5. Phased implementation plan that fits the current Church Planning Buddy repo.
```

