-- Evaluations certify learning independently of supplementary video/resources.
create or replace function public.recalculate_enrollment_progress(target_user_id uuid, target_course_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  total_modules int;
  completed_modules int;
  course_exams_completed boolean;
  course_completed boolean;
begin
  -- Serialize concurrent video/resource/exam refreshes for the same enrollment.
  perform 1 from public.enrollments
  where user_id = target_user_id and course_id = target_course_id
  for update;
  if not found then return; end if;

  with module_completion as (
    select m.id,
      case when exists (
        select 1 from public.exams x where x.module_id = m.id and x.is_active
      ) then not exists (
        select 1 from public.exams x
        where x.module_id = m.id and x.is_active
          and not exists (
            select 1 from public.exam_attempts ea
            where ea.exam_id = x.id and ea.user_id = target_user_id and ea.passed = true
          )
      ) else
        not exists (
          select 1 from public.assets a
          left join public.video_progress vp on vp.asset_id = a.id and vp.user_id = target_user_id
          where a.module_id = m.id and a.type = 'video' and not coalesce(vp.completed, false)
        )
        and not exists (
          select 1 from public.assets a
          left join public.resource_progress rp on rp.asset_id = a.id and rp.user_id = target_user_id
          where a.module_id = m.id and a.type <> 'video' and rp.asset_id is null
        )
      end as is_completed
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

  select count(*), count(*) filter (where mp.is_completed)
  into total_modules, completed_modules
  from public.modules m
  left join public.module_progress mp on mp.module_id = m.id and mp.user_id = target_user_id
  where m.course_id = target_course_id and m.is_published;

  select not exists (
    select 1 from public.exams x
    where x.course_id = target_course_id and x.module_id is null
      and x.is_active and x.blocks_progress
      and not exists (
        select 1 from public.exam_attempts ea
        where ea.exam_id = x.id and ea.user_id = target_user_id and ea.passed = true
      )
  ) into course_exams_completed;
  course_completed := total_modules > 0 and completed_modules = total_modules and course_exams_completed;

  update public.enrollments set
    progress_percent = case
      when total_modules = 0 then 0
      when completed_modules = total_modules and not course_exams_completed then 99
      else round((completed_modules::numeric / total_modules::numeric) * 100, 2)
    end,
    status = case when course_completed then 'completado'::public.enrollment_status else 'en_progreso'::public.enrollment_status end,
    started_at = coalesce(started_at, now()),
    completed_at = case when course_completed then coalesce(completed_at, now()) else null end
  where user_id = target_user_id and course_id = target_course_id;
end;
$$;

-- Replaying an already-completed video also repairs stale derived progress.
create or replace function public.refresh_progress_from_video()
returns trigger language plpgsql security definer set search_path = public as $$
declare course_uuid uuid;
begin
  select coalesce(a.course_id, m.course_id) into course_uuid
  from public.assets a left join public.modules m on m.id = a.module_id
  where a.id = new.asset_id;
  if course_uuid is not null then
    perform public.recalculate_enrollment_progress(new.user_id, course_uuid);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_progress_after_video on public.video_progress;
create trigger refresh_progress_after_video after insert or update of completed on public.video_progress
  for each row execute function public.refresh_progress_from_video();

-- Backfill every enrollment, including stale completed and not-yet-started rows.
do $$
declare enrollment_record record;
begin
  for enrollment_record in select user_id, course_id from public.enrollments loop
    perform public.recalculate_enrollment_progress(enrollment_record.user_id, enrollment_record.course_id);
  end loop;
end;
$$;
