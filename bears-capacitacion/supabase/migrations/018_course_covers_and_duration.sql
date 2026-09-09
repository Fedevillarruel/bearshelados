alter table public.courses
  add column if not exists cover_storage_path text;

create or replace function public.course_estimate_word_count(value text)
returns integer
language sql
immutable
set search_path = public
as $$
  select coalesce(cardinality(regexp_split_to_array(nullif(btrim(value), ''), '\s+')), 0);
$$;

create or replace function public.refresh_course_estimated_minutes(target_course_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  calculated_minutes integer;
begin
  if target_course_id is null then
    return;
  end if;

  select coalesce(ceiling(sum(item.minutes)), 0)::integer
  into calculated_minutes
  from (
    select case a.type
      when 'video' then a.duration_seconds::numeric / 60
      when 'text' then greatest(1::numeric, ceiling(public.course_estimate_word_count(a.url)::numeric / 200))
      when 'pdf' then greatest(1::numeric, ceiling(coalesce(a.size_bytes, 0)::numeric / 262144))
      when 'document' then greatest(1::numeric, ceiling(coalesce(a.size_bytes, 0)::numeric / 409600))
      when 'spreadsheet' then greatest(1::numeric, ceiling(coalesce(a.size_bytes, 0)::numeric / 524288))
      when 'image' then 1::numeric
      when 'link' then 2::numeric
      else 0::numeric
    end as minutes
    from public.assets a
    left join public.modules m on m.id = a.module_id
    where a.course_id = target_course_id
      or (m.course_id = target_course_id and m.is_published)

    union all

    select coalesce(
      e.time_limit_minutes::numeric,
      greatest(
        1::numeric,
        ceiling(coalesce((
          select sum(
            0.75::numeric + (
              public.course_estimate_word_count(q.prompt)
              + public.course_estimate_word_count(q.explanation)
              + coalesce((
                select sum(public.course_estimate_word_count(o.label))
                from public.options o
                where o.question_id = q.id
              ), 0)
            )::numeric / 200
          )
          from public.questions q
          where q.exam_id = e.id
        ), 0))
      )
    ) as minutes
    from public.exams e
    left join public.modules m on m.id = e.module_id
    where e.is_active
      and (
        e.course_id = target_course_id
        or (m.course_id = target_course_id and m.is_published)
      )
  ) as item;

  update public.courses
  set estimated_minutes = calculated_minutes
  where id = target_course_id;
end;
$$;

create or replace function public.refresh_course_duration_after_asset()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_course_id uuid;
  old_course_id uuid;
begin
  if tg_op <> 'DELETE' then
    select coalesce(new.course_id, m.course_id)
    into new_course_id
    from public.modules m
    where m.id = new.module_id;
    new_course_id := coalesce(new.course_id, new_course_id);
    perform public.refresh_course_estimated_minutes(new_course_id);
  end if;

  if tg_op <> 'INSERT' then
    select coalesce(old.course_id, m.course_id)
    into old_course_id
    from public.modules m
    where m.id = old.module_id;
    old_course_id := coalesce(old.course_id, old_course_id);
    if old_course_id is distinct from new_course_id then
      perform public.refresh_course_estimated_minutes(old_course_id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_course_duration_after_module()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'DELETE' then
    perform public.refresh_course_estimated_minutes(new.course_id);
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.course_id is distinct from new.course_id) then
    perform public.refresh_course_estimated_minutes(old.course_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_course_duration_after_exam()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_course_id uuid;
  old_course_id uuid;
begin
  if tg_op <> 'DELETE' then
    select coalesce(new.course_id, m.course_id)
    into new_course_id
    from public.modules m
    where m.id = new.module_id;
    new_course_id := coalesce(new.course_id, new_course_id);
    perform public.refresh_course_estimated_minutes(new_course_id);
  end if;

  if tg_op <> 'INSERT' then
    select coalesce(old.course_id, m.course_id)
    into old_course_id
    from public.modules m
    where m.id = old.module_id;
    old_course_id := coalesce(old.course_id, old_course_id);
    if old_course_id is distinct from new_course_id then
      perform public.refresh_course_estimated_minutes(old_course_id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_course_duration_after_question()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_exam_id uuid;
  target_course_id uuid;
begin
  parent_exam_id := case when tg_op = 'DELETE' then old.exam_id else new.exam_id end;
  select coalesce(e.course_id, m.course_id)
  into target_course_id
  from public.exams e
  left join public.modules m on m.id = e.module_id
  where e.id = parent_exam_id;
  perform public.refresh_course_estimated_minutes(target_course_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_course_duration_after_option()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_question_id uuid;
  target_course_id uuid;
begin
  parent_question_id := case when tg_op = 'DELETE' then old.question_id else new.question_id end;
  select coalesce(e.course_id, m.course_id)
  into target_course_id
  from public.questions q
  join public.exams e on e.id = q.exam_id
  left join public.modules m on m.id = e.module_id
  where q.id = parent_question_id;
  perform public.refresh_course_estimated_minutes(target_course_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_course_duration_after_asset on public.assets;
create trigger refresh_course_duration_after_asset
  after insert or update or delete on public.assets
  for each row execute function public.refresh_course_duration_after_asset();

drop trigger if exists refresh_course_duration_after_module on public.modules;
create trigger refresh_course_duration_after_module
  after insert or update or delete on public.modules
  for each row execute function public.refresh_course_duration_after_module();

drop trigger if exists refresh_course_duration_after_exam on public.exams;
create trigger refresh_course_duration_after_exam
  after insert or update or delete on public.exams
  for each row execute function public.refresh_course_duration_after_exam();

drop trigger if exists refresh_course_duration_after_question on public.questions;
create trigger refresh_course_duration_after_question
  after insert or update or delete on public.questions
  for each row execute function public.refresh_course_duration_after_question();

drop trigger if exists refresh_course_duration_after_option on public.options;
create trigger refresh_course_duration_after_option
  after insert or update or delete on public.options
  for each row execute function public.refresh_course_duration_after_option();

do $$
declare
  course_record record;
begin
  for course_record in select id from public.courses loop
    perform public.refresh_course_estimated_minutes(course_record.id);
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');