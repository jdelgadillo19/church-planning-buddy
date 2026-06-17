-- Distinguish sanctuary presentation rig from bootstrap / legacy rig rows.

alter table public.pp_rigs
  add column if not exists rig_kind text not null default 'presentation';

update public.pp_rigs
set rig_kind = 'bootstrap'
where device_fingerprint = 'bootstrap';

alter table public.pp_rigs
  drop constraint if exists pp_rigs_rig_kind_check;

alter table public.pp_rigs
  add constraint pp_rigs_rig_kind_check check (rig_kind in ('presentation', 'bootstrap'));

comment on column public.pp_rigs.rig_kind is
  'presentation = sanctuary Grapevine Rig (canonical index + apply). bootstrap = legacy pp:index-upload row.';

-- Broader legacy/bootstrap classification than device_fingerprint = bootstrap alone.
update public.pp_rigs
set rig_kind = 'bootstrap'
where rig_kind = 'presentation'
  and (
    device_fingerprint = 'bootstrap'
    or public_key = 'bootstrap'
    or rig_secret_hash is null
  );

-- Keep newest active presentation rig per org; revoke older duplicates.
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id
      order by created_at desc
    ) as rn
  from public.pp_rigs
  where status = 'active'
    and rig_kind = 'presentation'
)
update public.pp_rigs as r
set status = 'revoked'
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

-- One active presentation rig per org (multi-campus later via explicit rig_id on builds).
create unique index if not exists idx_pp_rigs_one_presentation_per_org
  on public.pp_rigs (org_id)
  where (status = 'active' and rig_kind = 'presentation');
