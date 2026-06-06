# Grapevine Prep — hosting on grapevineprep.com

Product domain only. Not hosted on Corpus Studios.

## Auth (required before production)

1. Dedicated Supabase project.
2. Run migration `supabase/migrations/20260604120000_tenancy_and_auth.sql`.
3. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Seed `organizations` + `org_members` for each invited church team.
5. With env set, middleware enforces login + org membership on all routes except `/login`, `/auth/*`, and `/api/auth/google/callback`.

Local dev without Supabase: omit `NEXT_PUBLIC_SUPABASE_*` — middleware stays off (legacy `.data/` Google tokens still work).

---

## Manual setup checklist (do this once)

Complete these steps **before** deploying auth changes. Google sign-in and Drive access share one OAuth client.

### 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → your project (or create one for Grapevine Prep).
2. **APIs & Services → Library** — enable:
   - Google Drive API
   - Google Docs API
   - Google Sheets API
   - Google Calendar API
3. **APIs & Services → OAuth consent screen**
   - User type: **Internal** (Workspace) or **External** (if non-Workspace testers)
   - Add scopes: `drive`, `documents`, `spreadsheets.readonly`, `calendar.events`, plus default OpenID/email/profile
4. **APIs & Services → Credentials → Create OAuth client ID**
   - Type: **Web application**
   - Name: e.g. `Grapevine Prep`
   - **Authorized redirect URIs** — add **both**:
     - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
     - `https://grapevineprep.com/api/auth/google/callback`
     - (optional local) `http://localhost:3000/api/auth/google/callback`
   - Copy **Client ID** and **Client secret**

Find your Supabase project ref in the dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`.

### 2. Supabase Dashboard — Google provider

1. **Authentication → Providers → Google** — Enable
2. Paste the **same** Client ID and Client secret from step 1 (must match `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.local`)
3. Save

### 3. Supabase Dashboard — URL configuration

**Authentication → URL Configuration**:

| Field | Production value |
|-------|------------------|
| **Site URL** | `https://grapevineprep.com` |
| **Redirect URLs** (add each) | `https://grapevineprep.com/auth/callback` |
| | `https://www.grapevineprep.com/auth/callback` |
| | `http://localhost:3000/auth/callback` (local dev) |

If **Site URL** is still `http://localhost:3000`, email links open localhost even when you sign in on grapevineprep.com. Old emails keep the old URL — request a **new** link after saving.

### 4. Supabase — org allowlist

After the first admin signs in with Google, note their user UUID (**Authentication → Users**), then in **SQL Editor**:

```sql
insert into public.organizations (name, slug) values ('My Church', 'my-church');
insert into public.org_members (org_id, user_id, role)
  values ('<org-id>', '<auth-user-uuid>', 'admin');
```

Repeat `org_members` for each invited user.

### 5. Environment variables (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only; never NEXT_PUBLIC

GOOGLE_CLIENT_ID=<same-as-supabase-google-provider>
GOOGLE_CLIENT_SECRET=<same-as-supabase-google-provider>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

`SUPABASE_SERVICE_ROLE_KEY` is required in production so Google tokens persist in the `oauth_tokens` table (Workers have no durable local disk).

Get the service role key from **Supabase → Project Settings → API → service_role** (keep secret).

### 6. Cloudflare — canonical host (recommended)

Supabase session cookies are host-specific. Pick one canonical host and redirect the other:

**Cloudflare Dashboard → grapevineprep.com → Rules → Redirect Rules**

- Redirect `www.grapevineprep.com/*` → `https://grapevineprep.com/$1` (301)

Or the reverse — just use one consistently everywhere (Site URL, bookmarks, OAuth).

### 7. Deploy

```bash
cd church-planning-buddy
npm install
npm run deploy:cf    # build + deploy Worker
npm run env:cf       # sync .env.local secrets/vars (sets prod Google redirect URI)
```

`env:cf` sets `GOOGLE_REDIRECT_URI` to `https://grapevineprep.com/api/auth/google/callback` automatically.

---

## How auth works after setup

**Continue with Google** on `/login`:

1. Signs you into Supabase (app access + org check)
2. Requests Drive, Docs, Sheets, and Calendar scopes in the same consent screen
3. Saves Google API tokens to `oauth_tokens` (keyed by your user id)

You should **not** need a separate “Connect Google” step after signing in with Google. The Connect Google card is for **reconnect** (scope updates) or if Drive scopes were not granted at login.

**Email magic link** still works as a fallback but is rate-limited (~2/hour per address). Prefer Google sign-in.

---

## Verify production

1. Clear cookies or use a private window → `https://grapevineprep.com/login`
2. **Continue with Google** → consent shows Drive/Docs/Sheets/Calendar
3. Hub loads; Google card shows **Connected**
4. Open `/grg` → setup shows connected; try a Drive action
5. **Sign out** (hub header) → sign in again with Google (no magic link needed)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Google button does nothing / provider error | Google not enabled in Supabase | Step 2 above |
| Redirect URI mismatch | Missing callback URL in Google Cloud | Add both Supabase + grapevineprep URIs (step 1) |
| `not_invited` after login | No `org_members` row | Step 4 |
| Magic link opens localhost | Wrong Site URL | Step 3 |
| Connected briefly, then “Not connected” | Missing `SUPABASE_SERVICE_ROLE_KEY` on Worker | Step 5 + `npm run env:cf` |
| Connect Google → login loop | Session expired during OAuth | Sign in with Google first; reconnect only when already signed in |
| Drive works locally, not in prod | Tokens were in `.data/` file only | Deploy with service role key; sign in with Google again |

---

## Slide Deck + ProPresenter (hosted vs prep Mac)

Grapevine Prep on Cloudflare **cannot** reach ProPresenter on your Mac (`127.0.0.1:64509`) or run AppleScript export. GRG and Drive workflows work from the browser; Slide Deck apply/export does not.

| Step | On grapevineprep.com | On prep Mac |
|------|----------------------|-------------|
| PCO plan + commit preview | Yes (library match degraded without PP) | Full preview with PP |
| Apply to ProPresenter | No — use agent or CLI | `npm run slide-deck:apply` |
| Export `.proplaylist` | No — upload file or use agent | ProPresenter or CLI publish |
| Publish to Drive | Yes if you **upload** a `.proplaylist` (Connect Google) | `npm run slide-deck:publish` or agent |

### Mac agent (recommended)

1. Apply Supabase migration `supabase/migrations/20260607120000_slide_deck_jobs.sql`.
2. Set the same secret in both places:
   - Worker: `SLIDE_DECK_AGENT_TOKEN` (via `npm run env:cf` / wrangler secret)
   - Prep Mac `.env.local`: `SLIDE_DECK_AGENT_TOKEN=...`
3. On the Mac: `PP_ALLOW_WRITES=true`, ProPresenter running, Google connected for the operator account.
4. Run: `GRAPEVINE_PREP_URL=https://grapevineprep.com npm run slide-deck:agent`
5. On the site: build preview → **Send to Mac agent**.

### CLI fallback

```bash
npm run slide-deck:apply -- <planId> [--service-type-id=<id>]
npm run slide-deck:publish -- <planId>
```

Download manifest JSON from the hosted Slide Deck page (Option B) for reference.

See `docs/PROPRESENTER-PUBLISH.md` and `docs/SLIDE-DECK-AGENT.md`.

---

## Cloudflare Workers (OpenNext)

Wired: `wrangler.jsonc`, `open-next.config.ts`, `public/_headers`.

```bash
npm install
npm run env:cf
npm run deploy:cf
```

Preview locally in Workers runtime: `npm run preview:cf`

Custom domains: `grapevineprep.com`, `www.grapevineprep.com` (in `wrangler.jsonc`).

## Optional staging

Cloudflare Access on `staging.grapevineprep.com` only — not a substitute for Supabase RLS.

## Corpus portfolio

After production is stable, update [corpus-studios-site/index.html](../../corpus-studios-site/index.html) Grapevine card with link to `https://grapevineprep.com`.

## Future: email + password

Not implemented yet. When ready: enable Email provider in Supabase, add password fields to login, keep Google as the path for Drive access.
