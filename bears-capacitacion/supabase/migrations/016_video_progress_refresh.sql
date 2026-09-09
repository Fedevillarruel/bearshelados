create or replace function public.refresh_progress_from_video()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  course_uuid uuid;
begin
  if tg_op = 'UPDATE' and new.completed is not distinct from old.completed then
    return new;
  end if;

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

drop trigger if exists refresh_progress_after_video on public.video_progress;
create trigger refresh_progress_after_video
  after insert or update of completed on public.video_progress
  for each row execute function public.refresh_progress_from_video();

do $$
declare
  enrollment_record record;
begin
  for enrollment_record in select user_id, course_id from public.enrollments loop
    perform public.recalculate_enrollment_progress(enrollment_record.user_id, enrollment_record.course_id);
  end loop;
end;
$$;