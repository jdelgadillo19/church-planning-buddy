# Org Drive settings UI (deferred)

**Status:** Deferred — implement with **auth structuring**, not before.

**Canonical plan:** `.cursor/plans/org_drive_settings_ui_f7f0b816.plan.md` (Cursor plans)

## Summary

Let org **admins** configure GRG + ProPresenter Drive folders in the app (paste links or browse folders), stored per-org in Supabase — no terminal ID copy/paste or `deploy:cf` for folder changes.

## Prerequisite

Auth / org foundations: active org context, admin role gates, settings navigation.

## Until then

Drive layout remains deployment env vars + M0 re-point process ([m0-drive-repoint.md](./m0-drive-repoint.md)).
