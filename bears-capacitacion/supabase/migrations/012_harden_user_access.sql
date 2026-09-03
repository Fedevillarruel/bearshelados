create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, franchise_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'empleado'::public.app_role,
    case
      when coalesce(new.raw_user_meta_data->>'franchise_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (new.raw_user_meta_data->>'franchise_id')::uuid
      else null
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name;
  return new;
end;
$$;

alter table public.profiles drop constraint if exists franchise_required_for_team;
alter table public.profiles drop constraint if exists franchise_required_for_manager;
alter table public.profiles add constraint franchise_required_for_manager check (
  role <> 'franquiciado' or franchise_id is not null
);

drop policy if exists "admin manages profiles" on public.profiles;
drop policy if exists "admin manages non-super-admin profiles" on public.profiles;
drop policy if exists "super admins manage profiles" on public.profiles;
drop policy if exists "admins manage team profiles" on public.profiles;

create policy "super admins manage profiles" on public.profiles for all using (
  public.is_super_admin()
) with check (
  public.is_super_admin()
);

create policy "admins manage team profiles" on public.profiles for all using (
  public.is_admin()
  and not is_super_admin
  and role <> 'admin'
) with check (
  public.is_admin()
  and not is_super_admin
  and role <> 'admin'
);