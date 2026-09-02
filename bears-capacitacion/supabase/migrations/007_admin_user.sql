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
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), admin_id,
    jsonb_build_object('sub', admin_id::text, 'email', 'admin@bears-helados.com'),
    'email', 'admin@bears-helados.com', now(), now(), now()
  ) on conflict (provider, provider_id) do nothing;

  update public.profiles
    set role = 'admin', full_name = 'Administrador Bears', is_active = true, must_change_password = true
  where id = admin_id or email = 'admin@bears-helados.com';
end;
$$;