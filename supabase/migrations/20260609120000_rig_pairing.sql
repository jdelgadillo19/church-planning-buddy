-- Grapevine Rig pairing codes + per-rig API secrets (Phase 1)

alter table public.pp_rigs
  add column if not exists rig_secret_hash text;

comment on column public.pp_rigs.rig_secret_hash is
  'SHA-256 hash of rig API secret issued at pair time; null for bootstrap-only rigs.';

create table if not exists public.pp_rig_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_rig_id uuid references public.pp_rigs (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_pp_rig_pairing_codes_org
  on public.pp_rig_pairing_codes (org_id, created_at desc);

comment on table public.pp_rig_pairing_codes is
  'Short-lived codes for Grapevine Rig first-time pairing.';

alter table public.pp_rig_pairing_codes enable row level security;

create policy pp_rig_pairing_codes_admin on public.pp_rig_pairing_codes
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
