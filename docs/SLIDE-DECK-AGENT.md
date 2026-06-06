# Slide Deck Mac agent

Hosted Grapevine Prep queues slide-deck jobs; this agent runs on the **operator Mac** where ProPresenter is installed.

## Prerequisites

- ProPresenter 21.3+ with Network enabled
- `PP_ALLOW_WRITES=true` in `.env.local`
- Google connected in Grapevine Prep (tokens in Supabase `oauth_tokens`)
- Supabase migration `20260607120000_slide_deck_jobs.sql` applied
- Shared secret `SLIDE_DECK_AGENT_TOKEN` on Worker and Mac

## Run

```bash
cd church-planning-buddy
# .env.local: SLIDE_DECK_AGENT_TOKEN, SUPABASE_*, GOOGLE_*, PP_*, PCO_*
GRAPEVINE_PREP_URL=https://grapevineprep.com npm run slide-deck:agent
```

Optional: `SLIDE_DECK_AGENT_POLL_MS=5000` (default 5s).

## Flow

1. Operator builds commit preview on grapevineprep.com
2. Clicks **Send to Mac agent**
3. Agent polls `GET /api/slide-deck/agent/jobs` (claims next pending job)
4. Agent runs `applyCommitPlan` + `publishSlideDeckPackage` locally
5. Agent reports `PATCH /api/slide-deck/agent/jobs/{id}` with result or error

## Security

- Agent token is a bearer secret — treat like a password
- Only queue jobs while signed in; RLS limits users to their own job rows
- Agent uses service role to claim any pending job (single-tenant pilot)
