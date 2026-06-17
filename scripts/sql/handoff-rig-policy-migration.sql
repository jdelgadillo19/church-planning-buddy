-- Handoff rig policy (idempotent) — paste in Supabase SQL Editor if CLI push is unavailable
-- https://supabase.com/dashboard/project/odqfyzlwrpsfksdhprnv/sql/new

alter table public.slide_deck_submissions
  add column if not exists replace_on_rig boolean not null default false,
  add column if not exists admin_approved_for_rig boolean not null default false,
  add column if not exists version_label text;

alter table public.slide_deck_submissions
  drop constraint if exists slide_deck_submissions_rig_handoff_status_check;

alter table public.slide_deck_submissions
  add constraint slide_deck_submissions_rig_handoff_status_check check (
    rig_handoff_status is null
    or rig_handoff_status in ('pending', 'synced', 'skipped', 'awaiting_approval')
  );

comment on column public.slide_deck_submissions.replace_on_rig is
  'Uploader requested replacing the existing Sunday playlist on the presentation rig.';

comment on column public.slide_deck_submissions.admin_approved_for_rig is
  'Admin signed off for rig auto-import / Send-to-rig delivery.';

comment on column public.slide_deck_submissions.version_label is
  'Sequenced cloud package label (e.g. complete-v2) — all versions retained.';
