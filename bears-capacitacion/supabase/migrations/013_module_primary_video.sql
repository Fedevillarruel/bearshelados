alter table public.assets
  add column is_primary boolean not null default false;

alter table public.assets
  add constraint assets_primary_video_check
  check (not is_primary or (module_id is not null and type = 'video'));

create unique index assets_primary_video_per_module_idx
  on public.assets (module_id)
  where is_primary and module_id is not null;

create or replace function public.clear_previous_primary_module_video()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_primary and new.module_id is not null then
    update public.assets
      set is_primary = false
      where module_id = new.module_id
        and id is distinct from new.id
        and is_primary;
  end if;
  return new;
end;
$$;

create trigger assets_clear_previous_primary_module_videoç
  before insert or update of is_primary, module_id on public.assets
  for each row execute function public.clear_previous_primary_module_video();