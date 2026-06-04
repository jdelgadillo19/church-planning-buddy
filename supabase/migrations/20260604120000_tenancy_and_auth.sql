-- Grapevine Prep (church-planning-buddy): org-centric tenancy + RLS foundation
-- Apply in a dedicated Supabase project (not Gojito).

-- ---------------------------------------------------------------------------
-- Organizations & membership
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.organizations is 'Church / ministry tenant for Grapevine Prep.';

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Grapevine user profile; created on first sign-in.';

create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'planner',
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint org_members_role_check check (role in ('admin', 'planner', 'viewer')),
  constraint org_members_unique_active unique (org_id, user_id)
);

create index if not exists idx_org_members_user on public.org_members (user_id) where revoked_at is null;
create index if not exists idx_org_members_org on public.org_members (org_id) where revoked_at is null;

comment on table public.org_members is 'Org membership; revoked_at set instead of hard delete.';

-- ---------------------------------------------------------------------------
-- Integration tokens (server-only via RLS)
-- ---------------------------------------------------------------------------

create table if not exists public.oauth_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'google',
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[],
  updated_at timestamptz not null default now()
);

comment on table public.oauth_tokens is 'Google/PCO tokens; no direct client access.';

-- ---------------------------------------------------------------------------
-- Helpers (security definer — keep policies simple)
-- ---------------------------------------------------------------------------

create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id
  from public.org_members
  where user_id = auth.uid()
    and revoked_at is null;
$$;

revoke all on function public.user_org_ids() from public;
grant execute on function public.user_org_ids() to authenticated;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and revoked_at is null
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile bootstrap on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_grapevine_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Member'),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grapevine on auth.users;
create trigger on_auth_user_created_grapevine
  after insert on auth.users
  for each row execute function public.handle_new_grapevine_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.org_members enable row level security;
alter table public.oauth_tokens enable row level security;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (id in (select public.user_org_ids()));

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "org_members_select_own_or_shared_org" on public.org_members;
create policy "org_members_select_own_or_shared_org"
  on public.org_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or org_id in (select public.user_org_ids())
  );

-- No client insert/update on org_members — use service role or admin API
drop policy if exists "org_members_no_client_write" on public.org_members;
create policy "org_members_no_client_write"
  on public.org_members for insert
  to authenticated
  with check (false);

drop policy if exists "org_members_no_client_update" on public.org_members;
create policy "org_members_no_client_update"
  on public.org_members for update
  to authenticated
  using (false);

drop policy if exists "oauth_tokens_no_client" on public.oauth_tokens;
create policy "oauth_tokens_no_client"
  on public.oauth_tokens for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Seed example (run manually in SQL editor after first admin signs up):
-- insert into public.organizations (name, slug) values ('My Church', 'my-church');
-- insert into public.org_members (org_id, user_id, role)
--   values ('<org-id>', '<auth-user-uuid>', 'admin');
-- ---------------------------------------------------------------------------
