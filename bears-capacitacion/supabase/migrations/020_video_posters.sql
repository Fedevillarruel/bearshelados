alter table public.assets
  add column if not exists video_poster_storage_path text;

select pg_notify('pgrst', 'reload schema');