-- Alternative B: SQL-only administrator creation.
-- WARNING: this depends on Supabase Auth's internal auth schema and may vary by version.
-- Recommended approach: create the user in Authentication > Add user with Auto Confirm,
-- then run the UPDATE in README.md instead.
do $$
declare
  admin_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
    'admin@bears-helados.com', crypt('Bears_2026_platform', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Administrador Bears","role":"admin"}'::jsonb, now(), now()
  ) on conflict do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) select
    gen_random_uuid(), id,
    jsonb_build_object('sub', id::text, 'email', email),
    'email', email, now(), now(), now()
  from auth.users
  where id = admin_id
  on conflict (provider, provider_id) do nothing;

  insert into public.profiles (id, email, full_name, role, is_active, must_change_password)
  select id, email, 'Administrador Bears', 'admin'::public.app_role, true, true
  from auth.users
  where email = 'admin@bears-helados.com'
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = excluded.is_active,
    must_change_password = excluded.must_change_password;
end;
$$;