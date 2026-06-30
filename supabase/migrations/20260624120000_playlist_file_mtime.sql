-- Playlist source file mtime for handoff recency (D6)
alter table public.slide_deck_submissions
  add column if not exists playlist_file_mtime timestamptz;

comment on column public.slide_deck_submissions.playlist_file_mtime is
  'Source .proplaylist file modification time at upload; used for default handoff selection.';
