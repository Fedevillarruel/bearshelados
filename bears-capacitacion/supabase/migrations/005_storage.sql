insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', false), ('manuals', 'manuals', false), ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public reads course media" on storage.objects;
create policy "admin inserts course media" on storage.objects for insert with check (bucket_id = 'course-media' and public.is_admin());
create policy "admin updates course media" on storage.objects for update using (bucket_id = 'course-media' and public.is_admin());
create policy "admin deletes course media" on storage.objects for delete using (bucket_id = 'course-media' and public.is_admin());

create policy "team reads manual files" on storage.objects for select using (
  bucket_id = 'manuals' and public.current_app_role() in ('admin', 'franquiciado')
);
create policy "admin manages manual files" on storage.objects for all using (
  bucket_id = 'manuals' and public.is_admin()
) with check (bucket_id = 'manuals' and public.is_admin());

create policy "public reads avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "user updates own avatar" on storage.objects for insert with check (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);