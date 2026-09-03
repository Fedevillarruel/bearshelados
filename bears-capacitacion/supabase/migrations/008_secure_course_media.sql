-- Convert legacy public course media to private objects served through short-lived signed URLs.
update storage.buckets set public = false where id = 'course-media';
drop policy if exists "public reads course media" on storage.objects;
select pg_notify('pgrst', 'reload schema');