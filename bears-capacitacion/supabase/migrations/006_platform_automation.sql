alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles add column last_seen_at timestamptz;

alter table public.profiles add constraint franchise_required_for_manager check (
  role <> 'franquiciado' or franchise_id is not null
);

create table public.manual_downloads (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.manuals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);
create index manual_downloads_manual_id_idx on public.manual_downloads (manual_id);
alter table public.manual_downloads enable row level security;
create policy "read permitted manual downloads" on public.manual_downloads for select using (
  public.is_admin() or user_id = auth.uid()
);
create policy "record own manual download" on public.manual_downloads for insert with check (user_id = auth.uid());

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger modules_updated_at before update on public.modules for each row execute function public.set_updated_at();
create trigger manuals_updated_at before update on public.manuals for each row execute function public.set_updated_at();

create or replace function public.recalculate_enrollment_progress(target_user_id uuid, target_course_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare total_modules int; completed_modules int;
begin
  select count(*) into total_modules from public.modules where course_id = target_course_id and is_published;
  if total_modules = 0 then return; end if;

  select count(*) into completed_modules
  from public.modules m
  where m.course_id = target_course_id and m.is_published
    and not exists (
      select 1 from public.assets a left join public.video_progress vp
        on vp.asset_id = a.id and vp.user_id = target_user_id
      where a.module_id = m.id and a.type = 'video' and coalesce(vp.completed, false) = false
    )
    and not exists (
      select 1 from public.exams x
      where x.module_id = m.id and x.is_active and x.blocks_progress
        and not exists (
          select 1 from public.exam_attempts ea where ea.exam_id = x.id and ea.user_id = target_user_id and ea.passed = true
        )
    );

  insert into public.module_progress (user_id, module_id, is_completed, completed_at)
  select target_user_id, m.id, true, now() from public.modules m
  where m.course_id = target_course_id and m.is_published
    and not exists (
      select 1 from public.assets a left join public.video_progress vp on vp.asset_id = a.id and vp.user_id = target_user_id
      where a.module_id = m.id and a.type = 'video' and coalesce(vp.completed, false) = false
    )
  on conflict (user_id, module_id) do update set is_completed = excluded.is_completed, completed_at = coalesce(module_progress.completed_at, excluded.completed_at), updated_at = now();

  update public.enrollments set
    progress_percent = round((completed_modules::numeric / total_modules::numeric) * 100, 2),
    status = case when completed_modules = total_modules then 'completado'::public.enrollment_status else 'en_progreso'::public.enrollment_status end,
    started_at = coalesce(started_at, now()),
    completed_at = case when completed_modules = total_modules then coalesce(completed_at, now()) else null end
  where user_id = target_user_id and course_id = target_course_id;
end;
$$;

create or replace function public.refresh_progress_from_video()
returns trigger language plpgsql security definer set search_path = public as $$
declare course_uuid uuid;
begin
  select m.course_id into course_uuid from public.assets a join public.modules m on m.id = a.module_id where a.id = new.asset_id;
  if course_uuid is not null then perform public.recalculate_enrollment_progress(new.user_id, course_uuid); end if;
  return new;
end;
$$;
create trigger refresh_progress_after_video after insert or update of completed on public.video_progress for each row execute function public.refresh_progress_from_video();

create or replace function public.refresh_progress_from_exam()
returns trigger language plpgsql security definer set search_path = public as $$
declare course_uuid uuid;
begin
  select coalesce(x.course_id, m.course_id) into course_uuid from public.exams x left join public.modules m on m.id = x.module_id where x.id = new.exam_id;
  if course_uuid is not null and new.finished_at is not null then perform public.recalculate_enrollment_progress(new.user_id, course_uuid); end if;
  return new;
end;
$$;
create trigger refresh_progress_after_exam after insert or update of finished_at, passed on public.exam_attempts for each row execute function public.refresh_progress_from_exam();