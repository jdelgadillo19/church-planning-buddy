# Grapevine Prep — hosting on grapevineprep.com

Product domain only. Not hosted on Corpus Studios.

## Auth (required before production)

1. Dedicated Supabase project.
2. Run migration `supabase/migrations/20260604120000_tenancy_and_auth.sql`.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Seed `organizations` + `org_members` for each invited church team.
5. With env set, middleware enforces login + org membership on all routes except `/login` and `/auth/*`.

Local dev without Supabase: omit `NEXT_PUBLIC_SUPABASE_*` — middleware stays off (legacy `.data/` Google tokens still work).

## Cloudflare Workers (OpenNext)

Wired: `wrangler.jsonc`, `open-next.config.ts`, `public/_headers`.

```bash
npm install
# Sync .env.local → Worker vars/secrets (sets prod Google redirect)
npm run env:cf
npm run deploy:cf
```

Preview locally in Workers runtime: `npm run preview:cf`

Custom domains: `grapevineprep.com`, `www.grapevineprep.com` (in `wrangler.jsonc`).

### Supabase Auth URLs (fixes magic links → localhost)

In the **Grapevine** Supabase project → **Authentication** → **URL Configuration**:

| Field | Production value |
|-------|------------------|
| **Site URL** | `https://grapevineprep.com` |
| **Redirect URLs** (add each) | `https://grapevineprep.com/auth/callback` |
| | `https://www.grapevineprep.com/auth/callback` |
| | `http://localhost:3000/auth/callback` (local dev) |

If **Site URL** is still `http://localhost:3000`, email links open localhost even when you sign in on grapevineprep.com. Old emails keep the old URL — request a **new** link after saving.

Optional: **Authentication** → **Email Templates** → confirm links use `{{ .RedirectTo }}` (default magic-link template does).

## Optional staging

Cloudflare Access on `staging.grapevineprep.com` only — not a substitute for Supabase RLS.

## Corpus portfolio

After production is stable, update [corpus-studios-site/index.html](../../corpus-studios-site/index.html) Grapevine card with link to `https://grapevineprep.com`.
