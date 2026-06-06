# Case: Slide Deck / ProPresenter hosted vs local

**Status:** Implemented (Phases 1–3)  
**Date:** 2026-06-07

## Conclusion

Hosted Grapevine Prep cannot call ProPresenter Local API or AppleScript. Fixes: hosted guards, Mac agent job queue, CLI/upload fallbacks.

## Evidence (confirmed)

- `isProPresenterUnavailableOnHosted()` — `src/lib/propresenter/hosted.ts`
- TCP transport — `src/lib/propresenter/tcp-transport.ts`
- AppleScript export — `src/lib/propresenter/playlist-native-export.ts`
- Status-only hosted guard (before fix) — `src/app/api/propresenter/status/route.ts`

## Implementation

| Phase | Deliverable |
|-------|-------------|
| 1 | `hosted-guard.ts`, all PP API routes, UI disables apply on hosted |
| 2 | Manifest JSON download, CLI hints, `.proplaylist` upload publish |
| 3 | `slide_deck_jobs` migration, agent API, `npm run slide-deck:agent` |

## Operator checklist

1. Apply migration `20260607120000_slide_deck_jobs.sql`
2. Set `SLIDE_DECK_AGENT_TOKEN` on Worker + Mac `.env.local`
3. Mac: `PP_ALLOW_WRITES=true`, `npm run slide-deck:agent`
4. Hosted: preview → Send to Mac agent (or CLI / upload publish)

## CLI validation

Scripts load and parse args:

- `npm run slide-deck:apply --` (usage error without planId — expected)
- `npm run slide-deck:publish --` (usage error without planId — expected)
- `npm run slide-deck:agent` (requires `SLIDE_DECK_AGENT_TOKEN`)

Full apply/publish requires ProPresenter + Google on operator Mac.
