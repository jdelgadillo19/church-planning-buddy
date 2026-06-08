-- Slide Deck platform: org-scoped rigs, index snapshots, builds
-- Replaces slide_deck_jobs for production writes (jobs table retained for debug)

-- ---------------------------------------------------------------------------
-- org_members: add operator role for rig apply permission
-- ---------------------------------------------------------------------------

alter table public.org_members drop constraint if exists org_members_role_check;
alter table public.org_members add constraint org_members_role_check check (
  role in ('admin', 'planner', 'viewer', 'operator')
);

-- ---------------------------------------------------------------------------
-- pp_rigs — registered presentation Mac per org
-- ---------------------------------------------------------------------------

create table if not exists public.pp_rigs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  display_name text not null,
  device_fingerprint text,
  public_key text not null,
  status text not null default 'active',
  last_seen_at timestamptz,
  paired_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint pp_rigs_status_check check (status in ('active', 'revoked'))
);

create index if not exists idx_pp_rigs_org on public.pp_rigs (org_id);
create index if not exists idx_pp_rigs_last_seen on public.pp_rigs (last_seen_at desc);

comment on table public.pp_rigs is 'Presentation rig Mac registered to an org (Grapevine Rig client).';

-- ---------------------------------------------------------------------------
-- pp_index_snapshots — immutable library/playlists index from rig scans
-- ---------------------------------------------------------------------------

create table if not exists public.pp_index_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  rig_id uuid not null references public.pp_rigs (id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  schema_version int not null default 1,
  index_json jsonb not null,
  delta_from_snapshot_id uuid references public.pp_index_snapshots (id),
  file_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_pp_index_snapshots_org_at
  on public.pp_index_snapshots (org_id, snapshot_at desc);

comment on table public.pp_index_snapshots is 'ProPresenter bundle index uploaded from rig; web preview reads latest per org.';

-- ---------------------------------------------------------------------------
-- slide_deck_builds — org-scoped build queue (replaces slide_deck_jobs)
-- ---------------------------------------------------------------------------

create table if not exists public.slide_deck_builds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  rig_id uuid references public.pp_rigs (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  plan_id text not null,
  service_type_id text,
  status text not null default 'pending',
  commit_plan jsonb not null,
  library_selections jsonb not null default '{}'::jsonb,
  change_summary text,
  publish_after_apply boolean not null default true,
  base_snapshot_id uuid references public.pp_index_snapshots (id),
  result jsonb,
  error_message text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slide_deck_builds_status_check check (
    status in ('pending', 'claimed', 'applying', 'completed', 'failed', 'rejected', 'cancelled')
  )
);

create index if not exists idx_slide_deck_builds_org_status
  on public.slide_deck_builds (org_id, status, created_at desc);

create index if not exists idx_slide_deck_builds_rig_pending
  on public.slide_deck_builds (rig_id, status, created_at asc)
  where status = 'pending';

comment on table public.slide_deck_builds is 'Org-scoped slide deck build queue for Grapevine Rig apply.';

comment on table public.slide_deck_jobs is
  'DEPRECATED: interim Mac agent queue. Use slide_deck_builds for new writes.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pp_rigs enable row level security;
alter table public.pp_index_snapshots enable row level security;
alter table public.slide_deck_builds enable row level security;

create policy pp_rigs_select_org on public.pp_rigs
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

create policy pp_rigs_admin_write on public.pp_rigs
  for all to authenticated
  using (
    org_id in (
      select org_id from public.org_members
      where user_id = auth.uid() and role = 'admin' and revoked_at is null
    )
  )
  with check (
    org_id in (
      select org_id from public.org_members
      where user_id = auth.uid() and role = 'admin' and revoked_at is null
    )
  );

create policy pp_index_snapshots_select_org on public.pp_index_snapshots
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

create policy slide_deck_builds_select_org on public.slide_deck_builds
  for select to authenticated
  using (org_id in (select public.user_org_ids()));

create policy slide_deck_builds_insert_planner on public.slide_deck_builds
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

create policy slide_deck_builds_update_org on public.slide_deck_builds
  for update to authenticated
  using (org_id in (select public.user_org_ids()));
