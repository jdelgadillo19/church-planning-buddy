-- Remote prep handoff fields (complete/incomplete upload workflow)

alter table public.slide_deck_submissions
  add column if not exists handoff_status text,
  add column if not exists missing_elements jsonb not null default '[]'::jsonb,
  add column if not exists missing_files jsonb not null default '[]'::jsonb,
  add column if not exists parent_handoff_id uuid references public.slide_deck_submissions (id) on delete set null,
  add column if not exists presentation_instance_id uuid not null default gen_random_uuid(),
  add column if not exists services_package_id text,
  add column if not exists services_drive_url text,
  add column if not exists rig_handoff_status text;

alter table public.slide_deck_submissions
  drop constraint if exists slide_deck_submissions_handoff_status_check;

alter table public.slide_deck_submissions
  add constraint slide_deck_submissions_handoff_status_check check (
    handoff_status is null or handoff_status in ('complete', 'incomplete')
  );

alter table public.slide_deck_submissions
  drop constraint if exists slide_deck_submissions_rig_handoff_status_check;

alter table public.slide_deck_submissions
  add constraint slide_deck_submissions_rig_handoff_status_check check (
    rig_handoff_status is null
    or rig_handoff_status in ('pending', 'synced', 'skipped')
  );

create index if not exists idx_slide_deck_submissions_handoffs
  on public.slide_deck_submissions (org_id, plan_id, handoff_status, created_at desc)
  where handoff_status is not null;

comment on column public.slide_deck_submissions.handoff_status is
  'Remote prep upload tag: complete or incomplete. Null = merge draft only (Submit draft).';

comment on column public.slide_deck_submissions.missing_elements is
  'Structured gaps when handoff_status=incomplete (songs, sermon slots, etc.).';

comment on column public.slide_deck_submissions.missing_files is
  'Local media paths on prep device not present in org filebase index.';

comment on column public.slide_deck_submissions.presentation_instance_id is
  'Fresh deck instance id per Create Presentation (never reused).';

comment on column public.slide_deck_submissions.rig_handoff_status is
  'Presentation rig sync state for complete handoffs (gatekeeper / M5).';
