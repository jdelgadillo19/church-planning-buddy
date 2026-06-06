-- Slide Deck Mac agent job queue (hosted UI → operator Mac apply/publish)

create table if not exists public.slide_deck_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null,
  service_type_id text,
  status text not null default 'pending',
  commit_plan jsonb not null,
  library_selections jsonb not null default '{}'::jsonb,
  resolution text,
  publish_after_apply boolean not null default true,
  result jsonb,
  error_message text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slide_deck_jobs_status_check check (
    status in ('pending', 'claimed', 'completed', 'failed', 'cancelled')
  )
);

create index if not exists idx_slide_deck_jobs_status_created
  on public.slide_deck_jobs (status, created_at desc);

create index if not exists idx_slide_deck_jobs_user
  on public.slide_deck_jobs (user_id, created_at desc);

comment on table public.slide_deck_jobs is
  'Queued slide-deck apply/publish jobs for the operator Mac agent.';

alter table public.slide_deck_jobs enable row level security;

create policy slide_deck_jobs_select_own on public.slide_deck_jobs
  for select to authenticated
  using (user_id = auth.uid());

create policy slide_deck_jobs_insert_own on public.slide_deck_jobs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy slide_deck_jobs_update_own on public.slide_deck_jobs
  for update to authenticated
  using (user_id = auth.uid());
