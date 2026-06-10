-- Submitted plans + implementation plan on builds (PLATFORM-1.6)

alter table public.slide_deck_builds
  add column if not exists implementation_plan jsonb;

comment on column public.slide_deck_builds.implementation_plan is
  'Reconciled row-level playlist with provenance; rig applies this when set.';

-- ---------------------------------------------------------------------------
-- slide_deck_submissions — per-user draft snapshots before Send
-- ---------------------------------------------------------------------------

create table if not exists public.slide_deck_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null,
  service_type_id text,
  playlist_name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft',
  commit_plan jsonb not null,
  library_selections jsonb not null default '{}'::jsonb,
  manifest jsonb,
  change_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slide_deck_submissions_status_check check (
    status in ('draft', 'superseded', 'merged')
  )
);

create index if not exists idx_slide_deck_submissions_scope
  on public.slide_deck_submissions (org_id, plan_id, playlist_name, status, created_at desc);

comment on table public.slide_deck_submissions is
  'Row-level submitted plan drafts; merged into implementation_plan at Send.';

alter table public.slide_deck_submissions enable row level security;

create policy slide_deck_submissions_select_org on public.slide_deck_submissions
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

create policy slide_deck_submissions_insert_planner on public.slide_deck_submissions
  for insert to authenticated
  with check (
    org_id in (
      select org_id from public.org_members
      where user_id = auth.uid()
        and role in ('admin', 'planner')
        and revoked_at is null
    )
    and created_by = auth.uid()
  );

create policy slide_deck_submissions_update_org on public.slide_deck_submissions
  for update to authenticated
  using (org_id in (select public.user_org_ids()));
