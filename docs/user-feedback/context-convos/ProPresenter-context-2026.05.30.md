-----
User
-----

reference church-planning-buddy repo

I want to make a tool in this project that takes input from planning center and the get ready guide, and creates a propresenter playlist

Basically, I want the program to:
- Create a new playlist
- Name it for the date of the service based on a pre-established convention
- Upload designated template elements into the new playlists
- Read Planning Center and/or the Get Ready Guide for song/service element selection and order placement
- Access ProPresenter's song and service element library to add designated elements to the service's playlist
- Read the Get Ready Guide for song lyric group arrangement, and edit the ProPresenter song's [LIVE] arrangement to match the Get Ready Guide
- Allow for peripheral devices to work remotely, and upload playlists to a cloud database (gdrive) for use on the primary presentation rig.
- Allow for upload commands to be initiated by the program itself, and not require manual user uploading

Help me parse out the details so I can prompt cursor

-----
chatGPT
-----

Here’s the clean way to parse this for Cursor, based on `church-planning-buddy` existing as `jdelgadillo19/church-planning-buddy` and already having PCO/GDrive-related project files like `src/lib/pco/attachment-open.ts`, `PRODUCT.md`, and `docs/PROJECT-STATUS.md`.   

## Core split

You are building **three separate layers**, not one giant feature:

1. **Service Plan Parser**

   * Pull Planning Center plan data.
   * Read Get Ready Guide.
   * Normalize both into one internal `ServicePlan` object.

2. **ProPresenter Playlist Builder**

   * Create playlist.
   * Name playlist by date convention.
   * Add templates, songs, videos, sermon slides, announcements, etc.
   * Reorder playlist items to match service order.

3. **Sync / Remote Handoff Layer**

   * Export generated playlist/package.
   * Upload to Google Drive.
   * Let primary ProPresenter rig download/import/use it.
   * Eventually allow remote commands, but do not make that MVP.

## Important constraint

Based on your previous ProPresenter spike, assume:

* Playlist create: **yes**
* Library search: **yes**
* Arrangement tile reorder through API: **probably no / not reliable**

So Cursor should **not start by trying to directly edit `[LIVE]` arrangements**. Treat that as a Phase 2/3 spike. MVP should generate the playlist and flag arrangement instructions for human review.

## Suggested internal data model

```ts
type ServicePlan = {
  serviceDate: string;
  playlistName: string;
  elements: ServiceElement[];
};

type ServiceElement = {
  id: string;
  type:
    | "template"
    | "song"
    | "scripture"
    | "sermon"
    | "announcement"
    | "video"
    | "custom";
  title: string;
  source: "planning_center" | "get_ready_guide" | "manual";
  order: number;
  propresenterSearchTerm?: string;
  arrangement?: SongArrangementInstruction;
  notes?: string;
};

type SongArrangementInstruction = {
  songTitle: string;
  targetArrangementName: "LIVE";
  lyricGroups: string[];
  sourceText: string;
};
```

## Cursor prompt 1 — discovery/audit

```text
Reference this repo: church-planning-buddy.

Audit the existing project structure and identify where the following systems currently live:
- Planning Center integration
- Google Drive integration
- document/get-ready-guide parsing
- environment variable handling
- API route structure
- UI entry points

Do not implement anything yet.

Return:
1. A concise architecture summary of the current repo.
2. The files that should be reused for a ProPresenter playlist generation feature.
3. The files that should be created.
4. Any missing dependencies or credentials.
5. A proposed phased implementation plan.

The feature goal is:
Take Planning Center + Get Ready Guide input, normalize it into a ServicePlan object, then use ProPresenter’s local API to create a playlist for a service.
```

## Cursor prompt 2 — add normalized service plan model

```text
Implement only the normalized service plan model layer.

Create TypeScript types and helper functions for a ProPresenter playlist generation workflow.

Requirements:
- Define ServicePlan, ServiceElement, and SongArrangementInstruction types.
- Add a function that generates a playlist name from a service date using a configurable naming convention.
- Add a function that normalizes raw Planning Center service elements into ServiceElement[].
- Add a function that can merge Get Ready Guide song arrangement notes into matching song elements.
- Do not call ProPresenter yet.
- Do not change existing PCO or Google Drive behavior unless necessary.
- Include basic tests or testable sample fixtures if the repo already has a test pattern.

Keep this as a pure data transformation layer.
```

## Cursor prompt 3 — ProPresenter local API client

```text
Add a ProPresenter local API client layer.

Requirements:
- Create a small typed client for the ProPresenter local API.
- Support configuration for host, port, and auth/token if needed through env vars.
- Implement functions for:
  - health/status check
  - library search
  - create playlist
  - add library item to playlist, if supported
  - add media/template item to playlist, if supported
  - reorder playlist items, if supported
- If an endpoint is unknown or unsupported, create a clearly named stub that throws a helpful “not implemented / endpoint needs verification” error.
- Do not build UI yet.
- Do not fake success for endpoints that may not exist.

Also add a markdown note documenting which ProPresenter endpoints are confirmed, assumed, or blocked.
```

## Cursor prompt 4 — playlist build orchestrator

```text
Build the playlist generation orchestrator.

Input:
- A normalized ServicePlan object.

Behavior:
- Create a ProPresenter playlist using the generated playlistName.
- Add configured template elements first or according to service order.
- For each ServiceElement:
  - If it is a song, search the ProPresenter library by title/search term.
  - If found, add it to the playlist.
  - If not found, add it to a “missing items” report.
  - If it has arrangement instructions, do not attempt unsafe direct editing yet. Add it to an “arrangement review required” report.
- Return a PlaylistBuildResult object with:
  - playlist id/name
  - added items
  - missing items
  - arrangement review items
  - warnings/errors

Do not implement Google Drive upload yet.
Do not require perfect ProPresenter coverage; fail gracefully.
```

## Cursor prompt 5 — Google Drive handoff

```text
Add Google Drive handoff for generated playlist build output.

Requirements:
- Reuse the existing Google Drive/auth patterns in this repo.
- After playlist generation, save a JSON build report to a configured Google Drive folder.
- Include:
  - service date
  - playlist name
  - added items
  - missing items
  - arrangement review items
  - errors/warnings
- Add a placeholder/export pathway for future ProPresenter playlist package files, but do not invent unsupported export behavior.
- Add clear env vars for target Google Drive folder IDs.

Goal:
The remote/prep computer can generate or stage a playlist build, and the primary presentation rig can retrieve the build report/package from Google Drive.
```

## Cursor prompt 6 — MVP UI

```text
Add a simple MVP UI for ProPresenter playlist generation.

The UI should let the user:
- Select or enter a Planning Center plan/service date.
- Attach or select a Get Ready Guide source if that pattern already exists in the app.
- Preview the normalized ServicePlan.
- Click “Generate ProPresenter Playlist”.
- See a build report:
  - created playlist name
  - added items
  - missing items
  - arrangement review required
  - errors/warnings
- Click “Upload Build Report to Google Drive”.

Keep the UI utilitarian. Do not over-design.
Do not add remote command execution yet.
```

## MVP boundary

For the first working version, aim for:

**Yes:**

* PCO/Get Ready Guide → normalized service plan
* Create playlist
* Add found ProPresenter library items
* Add templates if API supports it
* Build report
* GDrive upload of report

**Not yet:**

* automatic `[LIVE]` arrangement editing
* remote control of the primary rig
* fully automatic ProPresenter file/package upload
* background daemon behavior
* multi-device sync logic

That keeps Cursor from turning this into an unbounded automation monster.

-----
User
-----

You mentioned the three separate layers. Something important to consider is that the service plan parser and the sync layer are already existing elements in this program. Would it be easier/better to simply expand the scope of these layers, rather than creating a whole new set of layers for this tool? I feel like existing elements of these layers can already do what is needed, it's just a matter of specifying the behavior and maybe slightly expanding the scope

-----
chatGPT
-----

Yes — **better to expand the existing layers**, not create parallel ones.

Think of this as adding a new **output target** to the existing system:

```text
Existing inputs:
Planning Center + Get Ready Guide

Existing normalized output:
Team prep / guide / GDrive artifacts

New output:
ProPresenter playlist build
```

So the architecture should become:

```text
Planning Center + Get Ready Guide
        ↓
Existing service parser / normalized service model
        ↓
Artifact builders
   - Team Prep Doc builder
   - GDrive folder/report builder
   - NEW: ProPresenter playlist builder
        ↓
Existing sync / GDrive layer
```

The key Cursor instruction is:

```text
Do not create a separate parser or sync system. Reuse and extend the existing Planning Center, Get Ready Guide, and Google Drive layers. Add ProPresenter playlist generation as a new downstream artifact/output type.
```

A better revised prompt:

```text
Reference church-planning-buddy.

I want to add ProPresenter playlist generation as a new output target of the existing planning workflow.

Important architectural constraint:
Do not create a parallel service parser or parallel Google Drive sync system. The project already has Planning Center/Get Ready Guide parsing and Google Drive handoff behavior. Reuse and extend those existing layers.

Goal:
Take the existing normalized service data that already powers the Get Ready Guide / team prep workflow, and add a ProPresenter playlist builder that can:
- create a playlist named according to the existing service-date naming convention
- add configured template elements
- read song/service element order from the existing parsed service plan
- search the ProPresenter library for matching songs/service elements
- add matched items to the playlist
- produce a build report with added items, missing items, arrangement-review items, and warnings
- save that report through the existing Google Drive sync layer

Do not attempt automatic lyric arrangement editing yet unless there is already confirmed API support. For now, parse arrangement instructions from the Get Ready Guide and include them as review-required metadata in the build report.

First, audit the current repo and identify the exact existing parser/sync files to extend. Then propose the smallest safe implementation plan before coding.
```

The mental model should be:

**Not:** “Build a ProPresenter automation subsystem from scratch.”

**Instead:** “Add `proPresenterPlaylist` as another generated artifact alongside the existing guide/doc outputs.”
