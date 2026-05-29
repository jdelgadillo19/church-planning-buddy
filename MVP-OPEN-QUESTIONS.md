# Church Planning Buddy — MVP open questions

**Locked decisions (2026-05-22)** — do not re-litigate without explicit change:

| Topic | Decision |
|-------|----------|
| Intro roster | In scope **only if trivial** to add alongside date + song list |
| Scan replacement (MVP) | **No tagged blocks required** for MVP; tagged blocks are post-MVP future-proofing |
| Section delimiter | **New page** + **title text**; increase confidence via **bold title** + **horizontal line** (song-header) |
| Highest-quality scan | **Green tier only**; on green GDrive link, **navigate subdirectories**; prefer file whose title contains **`blank`** |
| Partial failure / ambiguity | Show **titles of candidate documents**; user **selects** which to incorporate |
| Commit / export | **Always require user signoff** before committing changes and exporting the finished Get Ready Guide |

---

Fill in the **Your answer** column. Leave blank if “use default / engineer’s call” is acceptable.

## Document edit contract

| # | Question | Why it matters | Your answer |
|---|----------|----------------|-------------|
| 1.1 | What exactly is the **intro** boundary in the live Google Doc? (e.g. everything before the first song-header page, or through the last `Key of …` song-list line only?) | Defines what stays vs what gets replaced when scans refresh | upper boundary is the top of the page, lower boundary is currently the page break after the last entry in the "song list" |
| 1.5 | **Date format** on intro: match sample (`May 24th, 2026`), PCO `dates`/`short_dates` verbatim, or a fixed formatting rule? | Intro header text | Match sample |
| 1.6 | **Song list line format** locked as `Key of {key}:{title} - {artist}`? Where does **artist** come from (PCO `song.author`, arrangement name, other)? | PCO field mapping | it comes from the "Linked Song" field of the "Song" tab within the item's navigation popup. It likely exists elsewhere as well |
| 1.7 | Canonical template is **Google Doc only** (`.docx` copy is reference only)? Any layout to preserve (tables, multi-column)? | Docs API vs import | Canonical document is the uploaded .docx. Later post-MVP builds will use an optimized template document which is hosted on Google Drive. After intro ends, and after the intro-ending "new page" line", format is: [Header] - {bold title line through horizontal line break} is single column, [Lyrics] - {song lyrics, section headers, red interlude markers, two line enter spacing in lyrics breaks} is two column format Preserve capitalization, highlighting, font color, bolding, etc. Only change typeface and font size if needed to match template |
| 1.8 | MVP scan refresh: **delete all content after intro** and insert this week’s scans (simple), or another rule? | MVP replacement without tagged blocks | for MVP, delete all content after intro. Keep it simple |

## Scan source & content

| # | Question | Why it matters | Your answer |
|---|----------|----------------|-------------|
| 2.3 | Are PCO attachment links **always** Google Drive URLs to org Drive, or sometimes other hosts (PCO file, Dropbox, etc.)? | Number of fetch adapters | For MVP, assume that all urls are Google Drive links. If you encounter an instance where this is not the case: notify the user, let them accept, and move on to the next step |
| 2.4 | Typical org scan file types besides GDrive-native: **PDF, .docx, image**? Expected GRG paste target is **plain text lyrics** (like sample) or preserve formatting? | Extraction strategy | Match formatting. Doc type will almost always be GDrive native, but there may be edge cases. For MVP, simply notify user when something is missing and allow progression to the next step |
| 2.5 | If a selected file is **not extractable as text** (image-only PDF), MVP: **skip**, **link only**, or **block signoff**? | Failure handling | As before, notify and skip |
| 2.6 | **Green** attachment on PCO points to a **folder** in org Drive — max depth to search for `blank`, or search entire subtree? | GDrive navigation limits | Search entire subtree for a document with a "blank" tag in title |
| 2.7 | Multiple files match `blank` under green path — pick **newest**, **shortest path**, or **always prompt user** (even when unambiguous)? | Tie-break vs step 5 picker | notify user and allow user to break tie manually |

## Inspection (presence & quality)

| # | Question | Why it matters | Your answer |
|---|----------|----------------|-------------|
| 3.1 | **Presence** for MVP: must be **green** before inclusion, or is **yellow** allowed with warning? | Gate before picker / signoff | Yellow is allowed with warning/signoff |
| 3.2 | **Quality** beyond tier: any rules (min length, CCLI line, etc.) or **tier + user selection** only? | Inspection logic | for MVP, tier + user selection is sufficient|
| 3.4 | Show inspection + candidate docs **before** signoff in one review screen, or separate steps? | UI flow | Display in separate steps (per song) |

## Google auth & drives

| # | Question | Why it matters | Your answer |
|---|----------|----------------|-------------|
| 4.1 | Confirm: **one OAuth** as Worship Leader Google account with access to **personal GRG** + **org scan** files (no separate org service account for MVP)? | Auth architecture | Confirmed. You should be able to view the files as though you were the worship leader. You will not receive full org access |
| 4.2 | Find GRG by **exact name**, **env file ID**, or **name + folder** pattern? | Config | GRG source will be a path/document title on GDrive. In later post-MVP builds, this will act as a way of reconfiguring the template |
| 4.4 | OK to require **re-consent** with Docs write + Drive read scopes (broader than today’s `drive.readonly`)? | OAuth change | Yes, let's give OAuth to write the GRG directly on Gdrive |
| 4.5 | Org scans on a **Shared drive** requiring `supportsAllDrives`? If yes, Shared drive ID(s)? | Drive API params | Not sure. I do know that my individual account has read access for the docs on the shared drive. I may not be able to receive info from org, certainly not without an MVP to showcase |

## PCO data

| # | Question | Why it matters | Your answer |
|---|----------|----------------|-------------|
| 5.1 | **Event date** source: `plan.dates`, `sort_date`, `last_time_at`, or other? | Intro date | Date of the reference plan is the source |
| 5.2 | **Key** per song: from plan item’s selected key (`items/{id}/key`) — confirm? | Song list lines | confirm |
| 5.3 | **Title** on intro + scan headings: plan **item title** vs PCO **song.title** when they differ? | Matching scan blocks | prefer **item title** in conflicts |
| 5.4 | Song order: **songs only** (exclude headers/media) — confirm? | Order list | confirmed: songs only |
| 5.5 | Can you provide **expected intro + song list** for plan `87788328` (redacted names OK) as a test fixture? | Automated tests | Expected output for `87788328` is already identical to "Get Ready Guide (SUN).docx" except for team member names. "Get Ready Guide (Good Friday)" will be uploaded as the dummy copy to edit. |

## Pipeline, signoff & export

| # | Question | Why it matters | Your answer |
|---|----------|----------------|-------------|
| 6.1 | Runtime order: **inspect → user picks sources → preview GRG → signoff → commit**, or different? | Orchestration | For MVP, yes, this is correct order |
| 6.2 | If signoff is denied, **no writes** to GRG — confirm? | Safety | confirmed. User may skip in part or in full. Any skipped section receives no write. If the process is cancelled, the doc reverts any changes |
| 6.3 | **Export** after signoff: **PDF**, **.docx**, **copy link**, or **in-place Google Doc update only** (no export)? | Export feature | Google Doc apply on signoff; optional **Post PDF to Planning Center** on the **Get Ready Guide** plan item with `.update.N` versioning. PCO token needs Services write + file upload. |
| 6.4 | Out of scope for MVP: confirm **ProPresenter**, local `CPB_SONG_FILES_ROOT`, debug `blank-doc` UI? | Repo scope | Confirmed. These elements are outside MVP scope |
| 7.1 | MVP usage: **local dev only** or **deployed** (e.g. Vercel) for weekly use? | Token/session storage | MVP is local only. Deployment will be first task for post-MVP build |
| 7.2 | Re-run same plan ID: **replace** scan sections in place (idempotent) — confirm? | Double-run behavior | I don't understand the meaning of this |
| 7.3 | You editing GRG during sync — acceptable risk for MVP? | Concurrency | For MVP, yes, this is acceptable. It would be cool to see the edits in real time |

---

## Status

**Completed 2026-05-22** — answers consolidated into [`PRODUCT.md`](./PRODUCT.md).

### Clarification added for 7.2 (idempotent re-run)

**Question:** If you run the same plan ID twice, should the second run **replace** last week’s scan content (no duplicates), or **append** a second copy?

**Your answer (via spec default):** **Replace** — delete everything after intro and insert fresh (same as 1.8). Second run = same result, not stacked songs.

---

## Remaining engineer-only items

| Item | Action |
|------|--------|
| Shared drive (`4.5`) | Use `supportsAllDrives` in API calls; validate with real org path during dev |
| Linked Song → artist field | Confirm exact PCO JSON path when implementing plan item fetch |
| Two-column + rich formatting (`1.7`) | Spike on Docs API `batchUpdate` for column breaks + style copy; may phase MVP styling |
