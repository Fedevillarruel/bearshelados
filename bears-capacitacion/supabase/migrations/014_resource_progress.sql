create table if not exists public.resource_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, asset_id)
);
create index if not exists resource_progress_user_id_idx on public.resource_progress (user_id);

alter table public.resource_progress enable row level security;

drop policy if exists "read permitted resource progress" on public.resource_progress;
create policy "read permitted resource progress" on public.resource_progress for select using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_app_role() = 'franquiciado' and exists (
      select 1 from public.profiles p where p.id = resource_progress.user_id and p.franchise_id = public.current_franchise_id()
    )
  )
);
drop policy if exists "record own enrolled resource progress" on public.resource_progress;
create policy "record own enrolled resource progress" on public.resource_progress for insert with check (
  user_id = auth.uid() and exists (
    select 1
    from public.assets a
    where a.id = resource_progress.asset_id
      and a.type <> 'video'
      and exists (
        select 1
        from public.enrollments e
        where e.user_id = auth.uid()
          and e.course_id = coalesce(a.course_id, (select m.course_id from public.modules m where m.id = a.module_id))
      )
  )
);
drop policy if exists "update own enrolled resource progress" on public.resource_progress;
create policy "update own enrolled resource progress" on public.resource_progress for update using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid() and exists (
    select 1
    from public.assets a
    where a.id = resource_progress.asset_id
      and a.type <> 'video'
      and exists (
        select 1
        from public.enrollments e
        where e.user_id = auth.uid()
          and e.course_id = coalesce(a.course_id, (select m.course_id from public.modules m where m.id = a.module_id))
      )
  )
);

drop policy if exists "employee writes own module progress" on public.module_progress;
drop policy if exists "employee updates own module progress" on public.module_progress;
drop policy if exists "employee writes own video progress" on public.video_progress;
drop policy if exists "employee updates own video progress" on public.video_progress;

drop policy if exists "record own enrolled video progress" on public.video_progress;
create policy "record own enrolled video progress" on public.video_progress for insert with check (
  user_id = auth.uid() and exists (
    select 1
    from public.assets a
    where a.id = video_progress.asset_id
      and a.type = 'video'
      and exists (
        select 1
        from public.enrollments e
        where e.user_id = auth.uid()
          and e.course_id = coalesce(a.course_id, (select m.course_id from public.modules m where m.id = a.module_id))
      )
  )
);
drop policy if exists "update own enrolled video progress" on public.video_progress;
create policy "update own enrolled video progress" on public.video_progress for update using (
  user_id = auth.uid()
) with check (
  user_id = auth.uid() and exists (
    select 1
    from public.assets a
    where a.id = video_progress.asset_id
      and a.type = 'video'
      and exists (
        select 1
        from public.enrollments e
        where e.user_id = auth.uid()
          and e.course_id = coalesce(a.course_id, (select m.course_id from public.modules m where m.id = a.module_id))
      )
  )
);

drop trigger if exists resource_progress_updated_at on public.resource_progress;
create trigger resource_progress_updated_at before update on public.resource_progress for each row execute function public.set_updated_at();

create or replace function public.recalculate_enrollment_progress(target_user_id uuid, target_course_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  total_modules int;
  completed_modules int;
  course_exams_completed boolean;
begin
  if not exists (
    select 1 from public.enrollments where user_id = target_user_id and course_id = target_course_id
  ) then
    return;
  end if;

  select count(*) into total_modules
  from public.modules
  where course_id = target_course_id and is_published;
  if total_modules = 0 then
    return;
  end if;

  with module_completion as (
    select
      m.id,
      not exists (
        select 1
        from public.assets a
        left join public.video_progress vp on vp.asset_id = a.id and vp.user_id = target_user_id
        where a.module_id = m.id
          and a.type = 'video'
          and coalesce(vp.completed, false) = false
      )
      and not exists (
        select 1
        from public.assets a
        left join public.resource_progress rp on rp.asset_id = a.id and rp.user_id = target_user_id
        where a.module_id = m.id
          and a.type <> 'video'
          and rp.asset_id is null
      )
      and not exists (
        select 1
        from public.exams x
        where x.module_id = m.id
          and x.is_active
          and x.blocks_progress
          and not exists (
            select 1
            from public.exam_attempts ea
            where ea.exam_id = x.id and ea.user_id = target_user_id and ea.passed = true
          )
      ) as is_completed
    from public.modules m
    where m.course_id = target_course_id and m.is_published
  )
  insert into public.module_progress (user_id, module_id, is_completed, completed_at)
  select target_user_id, id, is_completed, case when is_completed then now() else null end
  from module_completion
  on conflict (user_id, module_id) do update set
    is_completed = excluded.is_completed,
    completed_at = case when excluded.is_completed then coalesce(module_progress.completed_at, excluded.completed_at) else null end,
    updated_at = now();

  select count(*) into completed_modules
  from public.module_progress mp
  join public.modules m on m.id = mp.module_id
  where mp.user_id = target_user_id
    and m.course_id = target_course_id
    and m.is_published
    and mp.is_completed;

  select not exists (
    select 1
    from public.exams x
    where x.course_id = target_course_id
      and x.module_id is null
      and x.is_active
      and x.blocks_progress
      and not exists (
        select 1
        from public.exam_attempts ea
        where ea.exam_id = x.id and ea.user_id = target_user_id and ea.passed = true
      )
  ) into course_exams_completed;

  update public.enrollments set
    progress_percent = round((completed_modules::numeric / total_modules::numeric) * 100, 2),
    status = case when completed_modules = total_modules and course_exams_completed then 'completado'::public.enrollment_status else 'en_progreso'::public.enrollment_status end,
    started_at = coalesce(started_at, now()),
    completed_at = case when completed_modules = total_modules and course_exams_completed then coalesce(completed_at, now()) else null end
  where user_id = target_user_id and course_id = target_course_id;
end;
$$;

create or replace function public.refresh_progress_from_resource()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  course_uuid uuid;
begin
  select coalesce(a.course_id, m.course_id) into course_uuid
  from public.assets a
  left join public.modules m on m.id = a.module_id
  where a.id = new.asset_id;
  if course_uuid is not null then
    perform public.recalculate_enrollment_progress(new.user_id, course_uuid);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_progress_after_resource on public.resource_progress;
create trigger refresh_progress_after_resource after insert or update of viewed_at on public.resource_progress
  for each row execute function public.refresh_progress_from_resource();

do $$
declare
  enrollment_record record;
begin
  for enrollment_record in select user_id, course_id from public.enrollments loop
    perform public.recalculate_enrollment_progress(enrollment_record.user_id, enrollment_record.course_id);
  end loop;
end;
$$;
