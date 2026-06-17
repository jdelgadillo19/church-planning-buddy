# Next session bootstrap — slide deck librarian + rig handoffs

**Updated:** 2026-06-17  
**Live:** https://grapevineprep.com  
**Org:** `PP_PLATFORM_ORG_ID` in `.env.local` (Grapevine Prep)

Use this doc to resume testing. Detailed ops: [FILEBASE-LIBRARIAN-OPS.md](./FILEBASE-LIBRARIAN-OPS.md). Prep laptop flow: [PREP-LAPTOP-OPTION-A.md](./PREP-LAPTOP-OPTION-A.md).

---

## What shipped this sprint

### Lane A — Library (filebase)

- Rig → one-way **Computer backup** on Google Drive (not a duplicate `Filebase/` tree).
- Volunteers **request** files via Grapevine; **Owner Google** (file librarian) proxies Drive API.
- `PP_COMPUTER_FILEBASE_FOLDER_ID` → Computer backup root (`1-1I9HY7af_a2FCRw8WmKceAuI50DLJlg`).
- `PP_LIBRARIAN_USER_ID` → Supabase user UUID for sbblegacytech (Owner); tokens in `oauth_tokens`.
- Code: `src/lib/google/org-librarian-drive.ts`, `src/app/api/filebase/pull/route.ts`.

### Lane B — Weekly presentation (handoff)

- **Create → Download → Edit → Upload** (complete / incomplete).
- **BYO upload** without prior Create Presentation.
- **Version labels** (`complete-v1`, `incomplete-v2`, …) — all versions retained.
- **`replace_on_rig`** — uploader option; admin obeys immediately; non-admin notifies rig operator.
- **`admin_approved_for_rig`** — complete uploads auto-import on rig only after admin sign-off.
- Admin approve: `POST /api/pp/handoffs/[id]/approve` + UI on handoff discovery.
- Rig polls pending handoffs; auto-import when complete + approved + `services_drive_url`.

### Deploy + DB (done)

| Item | Status |
|------|--------|
| grapevineprep.com deploy | ✅ Worker `20599b6c…` (run `npm run env:cf` after env changes) |
| `20260616140000_slide_deck_handoffs.sql` | ✅ Applied |
| `20260617120000_handoff_rig_policy.sql` | ✅ Applied (`replace_on_rig`, `admin_approved_for_rig`, `version_label`, `awaiting_approval`) |
| Librarian env on Worker | ✅ `PP_LIBRARIAN_USER_ID` + `PP_COMPUTER_FILEBASE_FOLDER_ID` in `.env.local` → `npm run env:cf` |

Verify:

```bash
npm run handoff:verify-migration
npm run pp:inspect-index
```

---

## Pre-flight (before testing)

1. **`.env.local`** — librarian vars set (not committed; see `.env.local.example` comments).
2. **Owner Google** — sbblegacytech signed in on grapevineprep.com, **Connect Google** done (Drive scope).
3. **Cloud index** — presentation rig **Scan now** (or `npm run pp:index-upload` from rig) for library matching in browser.
4. **Prep laptop** (Download/Upload): `npm run prep:companion` → http://127.0.0.1:3000/slide-deck (ProPresenter local, `PP_ALLOW_WRITES=true`).

---

## Test plan (suggested order)

### 1. Hosted planner (grapevineprep.com)

- [ ] Sign in, pick weekend, **Weekend presentations** shows handoffs with version labels.
- [ ] **Create Presentation** — missing-song / library resolution (uses cloud index).
- [ ] **Pull filebase files** — should use librarian Drive (no “librarian not configured” error).
- [ ] **Upload presentation (BYO)** — scan local PP playlist without prior Create.
- [ ] Upload **Incomplete** — saves handoff; rig shows warning (may lack `services_drive_url`).
- [ ] Upload **Complete** with **Replace on rig** checkbox.
- [ ] As **admin**: **Admin sign-off — deliver to presentation rig** on complete upload.
- [ ] As **admin**: **Approve for presentation rig** on handoff awaiting approval.

### 2. Prep companion (Option A)

- [ ] `npm run prep:companion` — Download applies playlist to local ProPresenter.
- [ ] Edit in PP, open upload tool, scan/match, upload complete or incomplete.

### 3. Presentation rig

- [ ] Pending handoffs list updates after upload.
- [ ] **Auto-import** only when `complete` + `admin_approved_for_rig` + `services_drive_url`.
- [ ] Incomplete handoff — notification / warning; operator can skip or build fresh.
- [ ] Replace-on-rig messaging when uploader requested replace.

---

## Key commands

```bash
npm run handoff:verify-migration   # DB columns
npm run pp:inspect-index           # cloud library index
npm run prep:companion             # local slide-deck for Download/Upload
npm run deploy:cf                  # build + deploy Worker
npm run env:cf                     # push .env.local → Cloudflare (after saving file!)
npm run rig:worker:build           # rig handoff worker bundle
```

---

## Known gaps (not blocking browser testing)

- **Rig worker** (`apps/grapevine-rig-worker/src/handoff-worker.ts`) stages `.proplaylist` for File → Import; true PP API replace not wired.
- **Incomplete** handoffs may lack `services_drive_url` — rig Drive import won’t run until incomplete publish path exists.
- **Stale sermon auto-detection** — deferred.
- **Supabase CLI** not linked in repo; migrations applied via SQL Editor (`scripts/sql/handoff-rig-policy-migration.sql`).

---

## File map (start here in code)

| Area | Path |
|------|------|
| Slide deck page | `src/app/slide-deck/page.tsx` |
| Handoff discovery UI | `src/components/slide-deck-handoff-discovery.tsx` |
| Upload tool | `src/components/slide-deck-upload-tool.tsx` |
| Submissions API | `src/app/api/pp/submissions/route.ts` |
| Admin approve | `src/app/api/pp/handoffs/[id]/approve/route.ts` |
| Filebase pull | `src/app/api/filebase/pull/route.ts` |
| Librarian Drive | `src/lib/google/org-librarian-drive.ts` |
| Rig handoff policy | `src/lib/pp-platform/submissions.ts` |
| Rig frontend | `apps/grapevine-rig/frontend/main.js` |
| Migrations | `supabase/migrations/20260616*.sql`, `20260617120000_handoff_rig_policy.sql` |

---

## If something fails

| Symptom | Check |
|---------|--------|
| “File librarian not configured” | `PP_LIBRARIAN_USER_ID` in `.env.local`, saved, `npm run env:cf` |
| “Computer filebase folder not configured” | `PP_COMPUTER_FILEBASE_FOLDER_ID` + `env:cf` |
| Google tokens unavailable | Owner **Connect Google**; `oauth_tokens` row for librarian UUID |
| Create Presentation empty index | Rig **Scan now** or `pp:index-upload`; `pp:inspect-index` |
| Download/Upload on grapevineprep.com | Expected fail — use `prep:companion` (Option A) |
| Column errors on upload | `npm run handoff:verify-migration` |
