-- Remote prep jobs: web → Grapevine Client deep link → local pull/reconcile/build

create table if not exists public.remote_prep_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null,
  service_type_id text,
  status text not null default 'pending',
  client_token_hash text not null,
  commit_plan jsonb not null,
  library_selections jsonb not null default '{}'::jsonb,
  pull_id uuid,
  pull_file_name text,
  pull_manifest jsonb,
  result jsonb,
  error_message text,
  expires_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remote_prep_jobs_status_check check (
    status in ('pending', 'running', 'completed', 'failed', 'cancelled')
  )
);

create index if not exists idx_remote_prep_jobs_user_created
  on public.remote_prep_jobs (user_id, created_at desc);

create index if not exists idx_remote_prep_jobs_status_expires
  on public.remote_prep_jobs (status, expires_at);

comment on table public.remote_prep_jobs is
  'Short-lived remote prep jobs handed off from grapevineprep.com to Grapevine Client via deep link.';

alter table public.remote_prep_jobs enable row level security;

create policy remote_prep_jobs_select_own on public.remote_prep_jobs
  for select to authenticated
  using (user_id = auth.uid());

create policy remote_prep_jobs_insert_own on public.remote_prep_jobs
  for insert to authenticated
  with check (user_id = auth.uid());
