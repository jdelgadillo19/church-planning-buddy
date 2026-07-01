-- Remote prep job progress + cancel request

alter table public.remote_prep_jobs
  add column if not exists progress jsonb,
  add column if not exists cancel_requested_at timestamptz;

comment on column public.remote_prep_jobs.progress is
  'Latest staged progress payload from Grapevine Client worker (stage, label, percent, detail).';

comment on column public.remote_prep_jobs.cancel_requested_at is
  'When set, worker should stop cleanly and mark job cancelled.';
