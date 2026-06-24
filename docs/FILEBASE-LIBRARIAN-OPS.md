# Filebase librarian ops

**Architecture:** Presentation rig seeds **Shared Drive `Filebase/`** (M2). Volunteers **pull** selective library files via Grapevine; the **Owner** Google account (file librarian) proxies Drive API.

## Setup

1. **Owner** signs in to grapevineprep.com and runs **Connect Google** (full Drive scope).
2. Set in `.env.local` and Cloudflare Worker secrets:
   - `PP_LIBRARIAN_USER_ID` — Supabase `auth.users.id` for the Owner account
   - `GV_DRIVE_LAYOUT_ROOT_FOLDER_ID` — church Shared drive layout root
   - `PP_FILEBASE_FOLDER_PATH=Filebase` (or `PP_FILEBASE_FOLDER_ID` for the `Filebase/` folder)
   - `GV_DRIVE_LAYOUT=dual` or `v1` so pull resolves Shared Drive `Filebase/` (not legacy Computers backup)
3. Presentation rig: **Scan now** keeps `pp_index_snapshots` current (library matching in browser).
4. Presentation rig (M2, one-time): `npm run filebase:seed-upload` — populates `Filebase/Libraries/`, `Filebase/Playlists/`, and `Filebase/snapshots/baseline-*.json` with `driveFileId` per file.

**Do not** rely on `PP_COMPUTER_FILEBASE_FOLDER_ID` for M4 pull after M2 — that legacy Computers backup tree is retired per [envy-filebase-migration-runbook.md](./planning/envy-filebase-migration-runbook.md).

## Two indexes

| Index | Storage | Used for |
|-------|---------|----------|
| `pp_index_snapshots` | Supabase | Create Presentation library matching |
| `Filebase/snapshots/*.json` | Shared Drive | Pull filebase zip (`POST /api/filebase/pull`) |

## Lanes

| Lane | Direction | Tooling |
|------|-----------|---------|
| **A — Library** | Rig → Shared Drive `Filebase/` | `filebase:seed-upload`; rig Scan for Supabase index |
| **B — Weekly package** | Prep → `Services/` + Supabase handoff | Upload complete/incomplete; versioned folders |

## Verify

```bash
npm run operational:verify
npm run filebase:verify-drive    # after M2 seed (needs .data/google-tokens.json)
npm run handoff:verify-migration
npm run pp:inspect-index
```

Apply migration: `supabase/migrations/20260617120000_handoff_rig_policy.sql`
