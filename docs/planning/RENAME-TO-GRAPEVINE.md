# Rename: Church Planning Buddy → Grapevine

**Status:** **Deferred** — decision recorded; **do not implement** until explicitly scheduled.  
**Recorded:** 2026-06-03  
**Working title:** `church-planning-buddy` (repo folder, npm package, Drive root path, docs)  
**Target product name:** **Grapevine**

---

## Decision

`church-planning-buddy` was always a working title. The intended public name is **Grapevine**. This is a branding and identity pass, not a feature epic — but it touches many paths, operator-facing copy, and Google Drive layout that operators already use in production.

---

## Scope (when we do this)

### Product UI & metadata

| Surface | Location / notes |
|---------|------------------|
| Home hero | `src/app/page.tsx` — `<h1>Church Planning Buddy</h1>` |
| Document title | `src/app/layout.tsx` — `metadata.title` |
| Tool shell back link | `src/components/tool-shell.tsx` |
| Messaging notification title | `src/lib/messaging/run-workflow.ts` |
| Other pages | Grep `Church Planning Buddy` under `src/` |

No custom logo or favicon today (`public/` is default Next assets). A rename pass is the right time to add **Grapevine** branding (favicon, optional wordmark, OG/social metadata if we deploy publicly).

### Repo, package, and workspace

| Surface | Notes |
|---------|--------|
| Local directory | `church-planning-buddy/` → likely `grapevine/` (or keep folder slug; decide explicitly) |
| `package.json` `name` | `church-planning-buddy` |
| GitHub remote | `jdelgadillo19/church-planning-buddy` — rename repo + update clone URLs in docs |
| Parent `Projects/WORKSPACE.md` | If this app is indexed there, update path and display name |
| README, startup prompts | `README.md`, `docs/STARTUP-PROMPT.md`, `docs/STARTUP-PROMPT-PHASE1.md` |
| Session handoff | `docs/PROJECT-STATUS.md`, `PRODUCT.md`, and other active specs |

Historical docs (`docs/party/`, `docs/user-feedback/`, `_bmad-output/`) can stay as-is or get a one-line “formerly CPB” note — low priority.

### Google Drive layout (operator migration)

Defaults and env examples assume a personal Drive root folder named **`church-planning-buddy`**:

| Config | File |
|--------|------|
| GRG root | `src/lib/config/grg-drive.ts` — `DEFAULT_GRG_DRIVE_ROOT` |
| ProPresenter handoff | `src/lib/config/pp-drive.ts` — `DEFAULT_PP_DRIVE_ROOT` |
| Env examples | `.env.local.example` — `GRG_*_FOLDER_PATH`, `PP_*_FOLDER_PATH` |
| Tests | `src/lib/config/grg-drive.test.ts` |
| Operator docs | `docs/GRG-TEMPLATE.md`, `docs/PROPRESENTER-PUBLISH.md` |

**Migration checklist (not optional if we change the path string):**

1. Rename or recreate the Drive folder tree (e.g. `grapevine/Get Ready Guide/...`, `grapevine/ProPresenter/...`).
2. Update `.env.local` folder IDs/paths on the operator Mac.
3. Re-run `scripts/resolve-grg-folder-ids.ts` if using folder IDs.
4. Confirm existing GRG outputs and PP publish folders remain findable (bookmarks, shortcuts, or env-only change).

Consider keeping **`church-planning-buddy` as the Drive folder slug** even after the product is called Grapevine — only rename Drive if operators want folder names to match the product.

### Abbreviations & internal identifiers

| Item | Location | Rename? |
|------|----------|---------|
| `CPB` in docs / architecture diagrams | e.g. `docs/PROPRESENTER-SYNC-ARCHITECTURE.md` | Optional → `GV` or spell out Grapevine |
| `CPB_SONG_FILES_ROOT` | `src/app/api/files/song-scan-master/route.ts` | Env rename + `.env.local.example` + operator `.env.local` |
| `cpbWorkflowId` calendar extended property | `src/lib/messaging/calendar-sync.ts` | **Breaking** for existing calendar events if changed; prefer keep key or dual-read |
| `CPB` in comments | Various | Cosmetic |

### External services (manual, outside repo)

- Google Cloud OAuth consent screen **application name**
- Any deployed hostname / Vercel project name (when hosting exists)
- Planning Center, Slack, or email copy that says “Church Planning Buddy”

---

## Suggested implementation order (future)

1. **Lock slug strategy** — product name “Grapevine” vs repo folder `grapevine` vs Drive root `church-planning-buddy` (can differ).
2. **UI + metadata** — quick win, no Drive migration.
3. **Drive + env defaults** — coordinated with operator; document in README.
4. **Repo rename** — GitHub + local folder + workspace docs.
5. **Branding assets** — favicon, title bar, optional marketing copy.
6. **Bulk doc pass** — active docs only; archive unchanged.

---

## Out of scope for the rename itself

- Behavior changes to GRG, ProPresenter, or messaging workflows
- Renaming **Get Ready Guide (GRG)** — that is a document/product artifact name, not the app name (unless product decides otherwise later)

---

## References

- Project handoff: [`docs/PROJECT-STATUS.md`](../PROJECT-STATUS.md)
- Drive layout: [`docs/PROPRESENTER-PUBLISH.md`](../PROPRESENTER-PUBLISH.md), [`docs/GRG-TEMPLATE.md`](../GRG-TEMPLATE.md)
