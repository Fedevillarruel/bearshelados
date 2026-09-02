create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.current_franchise_id()
returns uuid language sql stable security definer set search_path = public as $$
  select franchise_id from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' and is_active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, franchise_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'empleado'),
    nullif(new.raw_user_meta_data->>'franchise_id', '')::uuid
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.franchises enable row level security;
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.assets enable row level security;
alter table public.enrollments enable row level security;
alter table public.module_progress enable row level security;
alter table public.video_progress enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.options enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;
alter table public.manuals enable row level security;
alter table public.manual_categories enable row level security;

create policy "profile self or permitted team" on public.profiles for select using (
  id = auth.uid() or public.is_admin() or (
    public.current_app_role() = 'franquiciado' and franchise_id = public.current_franchise_id()
  )
);
create policy "admin manages profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "read own franchise" on public.franchises for select using (public.is_admin() or id = public.current_franchise_id());
create policy "admin manages franchises" on public.franchises for all using (public.is_admin()) with check (public.is_admin());

create policy "read permitted courses" on public.courses for select using (
  public.is_admin() or public.current_app_role() = 'franquiciado' or exists (
    select 1 from public.enrollments e where e.course_id = courses.id and e.user_id = auth.uid()
  )
);
create policy "admin manages courses" on public.courses for all using (public.is_admin()) with check (public.is_admin());

create policy "read enrolled modules" on public.modules for select using (
  public.is_admin() or exists (
    select 1 from public.enrollments e where e.course_id = modules.course_id and e.user_id = auth.uid()
  )
);
create policy "admin manages modules" on public.modules for all using (public.is_admin()) with check (public.is_admin());

create policy "read enrolled assets" on public.assets for select using (
  public.is_admin() or exists (
    select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = coalesce(
      assets.course_id, (select m.course_id from public.modules m where m.id = assets.module_id)
    )
  )
);
create policy "admin manages assets" on public.assets for all using (public.is_admin()) with check (public.is_admin());

create policy "read permitted enrollments" on public.enrollments for select using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_app_role() = 'franquiciado' and exists (
      select 1 from public.profiles p where p.id = enrollments.user_id and p.franchise_id = public.current_franchise_id()
    )
  )
);
create policy "admin manages enrollments" on public.enrollments for all using (public.is_admin()) with check (public.is_admin());

create policy "read permitted module progress" on public.module_progress for select using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_app_role() = 'franquiciado' and exists (
      select 1 from public.profiles p where p.id = module_progress.user_id and p.franchise_id = public.current_franchise_id()
    )
  )
);
create policy "employee writes own module progress" on public.module_progress for insert with check (user_id = auth.uid());
create policy "employee updates own module progress" on public.module_progress for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read permitted video progress" on public.video_progress for select using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_app_role() = 'franquiciado' and exists (
      select 1 from public.profiles p where p.id = video_progress.user_id and p.franchise_id = public.current_franchise_id()
    )
  )
);
create policy "employee writes own video progress" on public.video_progress for insert with check (user_id = auth.uid());
create policy "employee updates own video progress" on public.video_progress for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read enrolled exams" on public.exams for select using (
  public.is_admin() or exists (
    select 1 from public.enrollments e where e.user_id = auth.uid() and e.course_id = coalesce(
      exams.course_id, (select m.course_id from public.modules m where m.id = exams.module_id)
    )
  )
);
create policy "admin manages exams" on public.exams for all using (public.is_admin()) with check (public.is_admin());

create policy "read questions from enrolled exam" on public.questions for select using (
  public.is_admin() or exists (
    select 1 from public.exams x join public.enrollments e on e.course_id = coalesce(
      x.course_id, (select m.course_id from public.modules m where m.id = x.module_id)
    ) where x.id = questions.exam_id and e.user_id = auth.uid()
  )
);
create policy "admin manages questions" on public.questions for all using (public.is_admin()) with check (public.is_admin());

-- Options, including is_correct, are only read through a SECURITY DEFINER exam submission function.
create policy "admin manages options" on public.options for all using (public.is_admin()) with check (public.is_admin());

create policy "read permitted attempts" on public.exam_attempts for select using (
  user_id = auth.uid() or public.is_admin() or (
    public.current_app_role() = 'franquiciado' and exists (
      select 1 from public.profiles p where p.id = exam_attempts.user_id and p.franchise_id = public.current_franchise_id()
    )
  )
);
create policy "read own answers" on public.exam_answers for select using (
  public.is_admin() or exists (
    select 1 from public.exam_attempts a where a.id = exam_answers.attempt_id and a.user_id = auth.uid() and a.finished_at is not null
  )
);

create policy "read manuals by role" on public.manuals for select using (public.current_app_role() = any (visible_to));
create policy "admin manages manuals" on public.manuals for all using (public.is_admin()) with check (public.is_admin());
create policy "read manual categories" on public.manual_categories for select using (auth.uid() is not null);
create policy "admin manages manual categories" on public.manual_categories for all using (public.is_admin()) with check (public.is_admin());