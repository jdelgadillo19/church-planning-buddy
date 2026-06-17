# Filebase librarian ops

**Architecture:** Presentation rig → one-way Computer backup → cloud filebase. Volunteers **request** files via Grapevine; the **Owner** Google account (file librarian) proxies Drive API.

## Setup

1. **Owner** signs in to grapevineprep.com and runs **Connect Google** (full Drive scope).
2. Set in `.env.local` and Cloudflare Worker secrets:
   - `PP_LIBRARIAN_USER_ID` — Supabase `auth.users.id` for the Owner account
   - `PP_COMPUTER_FILEBASE_FOLDER_ID` — legacy Computer backup root (`1-1I9HY7…` per [m0-drive-repoint.md](./planning/m0-drive-repoint.md))
3. Presentation rig: **Scan now** keeps `pp_index_snapshots` current (library matching in browser).

## Lanes

| Lane | Direction | Tooling |
|------|-----------|---------|
| **A — Library** | Rig → cloud (Computer backup only) | Google Drive for desktop on rig only; no remote sync |
| **B — Weekly package** | Prep → `Services/` + Supabase handoff | Upload complete/incomplete; versioned folders |

## Upload policy

- **BYO upload** — no prior Create Presentation required (`Upload presentation (BYO)`).
- **Admin sign-off** — complete uploads reach rig auto-import only when admin checks **Admin sign-off — deliver to presentation rig**.
- **Replace on rig** — uploader option; non-admin replace notifies operator on rig; admin replace applies when approved.
- **All versions kept** — `version_label` (`complete-v1`, `complete-v2`, …).

## Rig behavior

- Polls handoffs with `rig_handoff_status=pending` and (`complete` + `admin_approved_for_rig`, or `incomplete`).
- **Auto-import** when admin-approved complete has `services_drive_url`.
- Incomplete: import with warning; operator may skip or build fresh.

## Verify

```bash
npm run handoff:verify-migration
npm run pp:inspect-index
```

Apply migration: `supabase/migrations/20260617120000_handoff_rig_policy.sql`
