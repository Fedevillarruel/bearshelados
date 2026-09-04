create or replace function public.delete_auth_user_for_service_role(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the service role can delete Auth users through this function.' using errcode = '42501';
  end if;

  delete from auth.users where id = target_user_id;
  return found;
end;
$$;

revoke all on function public.delete_auth_user_for_service_role(uuid) from public, anon, authenticated;
grant execute on function public.delete_auth_user_for_service_role(uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
