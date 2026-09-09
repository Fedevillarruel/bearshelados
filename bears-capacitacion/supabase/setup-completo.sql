-- Bears Helados: instalación completa de Supabase.

-- Ejecutar una sola vez en Supabase SQL Editor sobre un proyecto vacío.

-- Incluye esquema, RLS, Storage, automatizaciones y base de Tiendanube.

-- La transacción evita instalaciones parciales si cualquier sentencia falla.
begin;

-- ============================================================================
-- BEGIN: supabase/migrations/001_init.sql
-- ============================================================================
create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'franquiciado', 'empleado');
create type public.asset_type as enum ('video', 'pdf', 'image', 'text', 'link');
create type public.enrollment_status as enum ('asignado', 'en_progreso', 'completado');

create table public.franchises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'empleado',
  franchise_id uuid references public.franchises(id) on delete set null,
  position text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_franchise_id_idx on public.profiles (franchise_id);
create index profiles_role_idx on public.profiles (role);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  summary text,
  cover_url text,
  category text,
  estimated_minutes int default 0 check (estimated_minutes >= 0),
  is_published boolean not null default false,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text,
  order_index int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index modules_course_order_idx on public.modules (course_id, order_index);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete cascade,
  type public.asset_type not null,
  title text not null,
  description text,
  url text not null,
  storage_path text,
  duration_seconds int default 0,
  size_bytes bigint,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  constraint asset_parent_check check (
    (course_id is not null and module_id is null)
    or (course_id is null and module_id is not null)
  ),
  constraint video_duration_check check (
    (type = 'video' and duration_seconds > 0) or (type <> 'video' and duration_seconds >= 0)
  )
);
create index assets_module_order_idx on public.assets (module_id, order_index);
create index assets_course_order_idx on public.assets (course_id, order_index);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  due_date date,
  status public.enrollment_status not null default 'asignado',
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  unique (user_id, course_id)
);
create index enrollments_user_id_idx on public.enrollments (user_id);
create index enrollments_course_id_idx on public.enrollments (course_id);

create table public.module_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  is_completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, module_id)
);

create table public.video_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  seconds_watched int not null default 0 check (seconds_watched >= 0),
  last_position int not null default 0 check (last_position >= 0),
  total_seconds int not null default 0 check (total_seconds >= 0),
  watched_ranges jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  first_played_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, asset_id)
);
create index video_progress_user_id_idx on public.video_progress (user_id);-- END: supabase/migrations/001_init.sql

-- ============================================================================
-- BEGIN: supabase/migrations/002_exams.sql
-- ============================================================================
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete cascade,
  title text not null,
  description text,
  passing_score numeric(5,2) not null default 70 check (passing_score between 0 and 100),
  max_attempts int check (max_attempts is null or max_attempts > 0),
  cooldown_minutes int not null default 0 check (cooldown_minutes >= 0),
  time_limit_minutes int check (time_limit_minutes is null or time_limit_minutes > 0),
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  show_correct_answers boolean not null default false,
  blocks_progress boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint exam_parent_check check (
    (course_id is not null and module_id is null)
    or (course_id is null and module_id is not null)
  )
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  prompt text not null,
  explanation text,
  points numeric(5,2) not null default 1 check (points > 0),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index questions_exam_order_idx on public.questions (exam_id, order_index);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);
create index options_question_order_idx on public.options (question_id, order_index);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number int not null default 1 check (attempt_number > 0),
  score numeric(5,2) check (score between 0 and 100),
  correct_count int,
  total_questions int,
  passed boolean,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  unique (exam_id, user_id, attempt_number)
);
create index exam_attempts_user_exam_idx on public.exam_attempts (user_id, exam_id);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  is_correct boolean not null default false,
  unique (attempt_id, question_id)
);
create index exam_answers_attempt_id_idx on public.exam_answers (attempt_id);-- END: supabase/migrations/002_exams.sql

-- ============================================================================
-- BEGIN: supabase/migrations/003_manuals.sql
-- ============================================================================
create table public.manual_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  order_index int not null default 0
);

create table public.manuals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category_id uuid references public.manual_categories(id) on delete set null,
  file_url text not null,
  storage_path text,
  file_type text,
  size_bytes bigint,
  version int not null default 1 check (version > 0),
  visible_to public.app_role[] not null default array['admin','franquiciado']::public.app_role[],
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);-- END: supabase/migrations/003_manuals.sql

-- ============================================================================
-- BEGIN: supabase/migrations/004_rls.sql
-- ============================================================================
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
    'empleado'::public.app_role,
    case
      when coalesce(new.raw_user_meta_data->>'franchise_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (new.raw_user_meta_data->>'franchise_id')::uuid
      else null
    end
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
create policy "admin manages manual categories" on public.manual_categories for all using (public.is_admin()) with check (public.is_admin());-- END: supabase/migrations/004_rls.sql

-- ============================================================================
-- BEGIN: supabase/migrations/005_storage.sql
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', false), ('manuals', 'manuals', false), ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

update storage.buckets
set file_size_limit = 53687091200
where id in ('course-media', 'manuals');

drop policy if exists "public reads course media" on storage.objects;
create policy "admin inserts course media" on storage.objects for insert with check (bucket_id = 'course-media' and public.is_admin());
create policy "admin updates course media" on storage.objects for update using (bucket_id = 'course-media' and public.is_admin());
create policy "admin deletes course media" on storage.objects for delete using (bucket_id = 'course-media' and public.is_admin());

create policy "team reads manual files" on storage.objects for select using (
  bucket_id = 'manuals' and public.current_app_role() in ('admin', 'franquiciado')
);
create policy "admin manages manual files" on storage.objects for all using (
  bucket_id = 'manuals' and public.is_admin()
) with check (bucket_id = 'manuals' and public.is_admin());

create policy "public reads avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "user updates own avatar" on storage.objects for insert with check (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);-- END: supabase/migrations/005_storage.sql

-- ============================================================================
-- BEGIN: supabase/migrations/006_platform_automation.sql
-- ============================================================================
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
create trigger refresh_progress_after_exam after insert or update of finished_at, passed on public.exam_attempts for each row execute function public.refresh_progress_from_exam();-- END: supabase/migrations/006_platform_automation.sql

-- ============================================================================
-- BEGIN: supabase/migrations/007_admin_user.sql
-- ============================================================================
-- Intentionally empty. Creating a fixed administrator through auth.users is unsafe.
-- Create the first account in Supabase Authentication, then promote its profile as
-- described in README.md. Later accounts are managed from the application.
-- END: supabase/migrations/007_admin_user.sql

-- ============================================================================
-- BEGIN: supabase/migrations/009_tiendanube_foundation.sql
-- ============================================================================
-- Tiendanube must remain a separately authorized commercial surface.
alter table public.profiles add column if not exists is_super_admin boolean not null default false;

alter table public.profiles add constraint profile_super_admin_requires_admin check (
  not is_super_admin or role = 'admin'
);

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'admin' and is_active and is_super_admin
    from public.profiles
    where id = auth.uid()
  ), false);
$$;

-- Promote the first real administrator explicitly after creating it in Supabase Auth.
$$;

create or replace function public.protect_super_admin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin
    and auth.role() <> 'service_role'
    and not public.is_super_admin() then
    raise exception 'Only a super administrator can change Tiendanube access.';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_super_admin_flag
  before update of is_super_admin on public.profiles
  for each row execute function public.protect_super_admin_flag();

drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages non-super-admin profiles" on public.profiles for all using (
  public.is_super_admin() or (public.is_admin() and not is_super_admin)
) with check (
  public.is_super_admin() or (public.is_admin() and not is_super_admin)
);

create or replace function public.bootstrap_tiendanube_super_admin(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where is_super_admin) then
    raise exception 'A Tiendanube super administrator already exists.';
  end if;

  update public.profiles
  set is_super_admin = true
  where id = target_user_id and role = 'admin' and is_active;

  if not found then
    raise exception 'The bootstrap account must be an active administrator.';
  end if;
end;
$$;
revoke execute on function public.bootstrap_tiendanube_super_admin(uuid) from public;
grant execute on function public.bootstrap_tiendanube_super_admin(uuid) to service_role;

create table public.tiendanube_connections (
  id uuid primary key default gen_random_uuid(),
  store_id text not null unique check (store_id ~ '^[0-9]+$'),
  store_name text,
  scopes text[] not null default '{}'::text[],
  status text not null default 'disconnected' check (status in ('pending', 'connected', 'disconnected', 'revoked', 'error')),
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  revoked_at timestamptz,
  last_synced_at timestamptz,
  last_sync_status text not null default 'idle' check (last_sync_status in ('idle', 'queued', 'running', 'succeeded', 'failed')),
  last_sync_error text,
  webhook_registered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tiendanube_connections_status_idx on public.tiendanube_connections (status);

create table public.tiendanube_connection_secrets (
  connection_id uuid primary key references public.tiendanube_connections(id) on delete cascade,
  encrypted_access_token text not null,
  encryption_key_version int not null default 1 check (encryption_key_version > 0),
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tiendanube_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint tiendanube_oauth_state_expiry_check check (expires_at > created_at)
);
create index tiendanube_oauth_states_expiry_idx on public.tiendanube_oauth_states (expires_at) where consumed_at is null;

create table public.tiendanube_sku_branch_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  sku text not null check (sku = upper(trim(sku)) and length(sku) between 1 and 120),
  franchise_id uuid not null references public.franchises(id) on delete restrict,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_until date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiendanube_sku_mapping_dates_check check (effective_until is null or effective_until >= effective_from),
  unique (connection_id, sku)
);
create index tiendanube_sku_branch_mappings_franchise_idx on public.tiendanube_sku_branch_mappings (franchise_id) where is_active;

create table public.tiendanube_report_grants (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  franchise_id uuid not null references public.franchises(id) on delete cascade,
  can_view_sales boolean not null default false,
  can_view_inventory boolean not null default false,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiendanube_report_grant_dates_check check (ends_at is null or ends_at > starts_at),
  unique (connection_id, franchise_id)
);
create index tiendanube_report_grants_franchise_idx on public.tiendanube_report_grants (franchise_id) where is_active;

create table public.tiendanube_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  kind text not null check (kind in ('initial', 'incremental', 'webhook', 'privacy')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  cursor jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tiendanube_sync_runs_finished_check check (finished_at is null or started_at is not null)
);
create index tiendanube_sync_runs_connection_created_idx on public.tiendanube_sync_runs (connection_id, created_at desc);
create index tiendanube_sync_runs_queued_idx on public.tiendanube_sync_runs (created_at) where status = 'queued';

create table public.tiendanube_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.tiendanube_connections(id) on delete cascade,
  store_id text not null check (store_id ~ '^[0-9]+$'),
  event text not null check (length(event) between 1 and 120),
  resource_id text,
  sanitized_payload jsonb not null default '{}'::jsonb,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'failed')),
  processing_attempts int not null default 0 check (processing_attempts >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index tiendanube_webhook_events_queued_idx on public.tiendanube_webhook_events (received_at) where status = 'queued';
create index tiendanube_webhook_events_store_idx on public.tiendanube_webhook_events (store_id, event, received_at desc);

create table public.tiendanube_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  external_order_id text not null,
  order_number text,
  status text,
  payment_status text,
  shipping_status text,
  storefront text,
  total numeric(16, 2),
  currency text check (currency is null or length(currency) = 3),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  paid_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_order_id)
);
create index tiendanube_orders_connection_created_idx on public.tiendanube_orders (connection_id, source_created_at desc);

create table public.tiendanube_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.tiendanube_orders(id) on delete cascade,
  external_line_item_id text not null,
  external_product_id text,
  external_variant_id text,
  sku text,
  product_name text,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(16, 2),
  line_total numeric(16, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, external_line_item_id)
);
create index tiendanube_order_items_sku_idx on public.tiendanube_order_items (sku) where sku is not null;

create table public.tiendanube_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.tiendanube_connections(id) on delete cascade,
  external_product_id text not null,
  external_variant_id text not null,
  location_id text,
  sku text,
  product_name text,
  stock_management boolean,
  stock numeric(14, 3),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index tiendanube_inventory_snapshots_connection_time_idx on public.tiendanube_inventory_snapshots (connection_id, captured_at desc);
create index tiendanube_inventory_snapshots_sku_idx on public.tiendanube_inventory_snapshots (connection_id, sku, captured_at desc) where sku is not null;

create table public.tiendanube_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.tiendanube_connections(id) on delete cascade,
  store_id text not null check (store_id ~ '^[0-9]+$'),
  request_type text not null check (request_type in ('store_redact', 'customers_redact', 'customers_data_request')),
  external_request_id text,
  customer_id text,
  order_ids text[] not null default '{}'::text[],
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  unique (store_id, request_type, external_request_id)
);
create index tiendanube_privacy_requests_queued_idx on public.tiendanube_privacy_requests (received_at) where status = 'queued';

alter table public.tiendanube_connections enable row level security;
alter table public.tiendanube_connection_secrets enable row level security;
alter table public.tiendanube_oauth_states enable row level security;
alter table public.tiendanube_sku_branch_mappings enable row level security;
alter table public.tiendanube_report_grants enable row level security;
alter table public.tiendanube_sync_runs enable row level security;
alter table public.tiendanube_webhook_events enable row level security;
alter table public.tiendanube_orders enable row level security;
alter table public.tiendanube_order_items enable row level security;
alter table public.tiendanube_inventory_snapshots enable row level security;
alter table public.tiendanube_privacy_requests enable row level security;

create policy "super admins read Tiendanube connections" on public.tiendanube_connections for select using (public.is_super_admin());
create policy "super admins read SKU mappings" on public.tiendanube_sku_branch_mappings for select using (public.is_super_admin());
create policy "read own active Tiendanube report grants" on public.tiendanube_report_grants for select using (
  public.is_super_admin() or (
    public.current_app_role() = 'franquiciado'
    and franchise_id = public.current_franchise_id()
    and is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  )
);

create trigger tiendanube_connections_updated_at before update on public.tiendanube_connections for each row execute function public.set_updated_at();
create trigger tiendanube_connection_secrets_updated_at before update on public.tiendanube_connection_secrets for each row execute function public.set_updated_at();
create trigger tiendanube_sku_branch_mappings_updated_at before update on public.tiendanube_sku_branch_mappings for each row execute function public.set_updated_at();
create trigger tiendanube_report_grants_updated_at before update on public.tiendanube_report_grants for each row execute function public.set_updated_at();
create trigger tiendanube_orders_updated_at before update on public.tiendanube_orders for each row execute function public.set_updated_at();
create trigger tiendanube_order_items_updated_at before update on public.tiendanube_order_items for each row execute function public.set_updated_at();

create or replace function public.store_tiendanube_connection(
  target_store_id text,
  target_scopes text[],
  target_encrypted_access_token text,
  target_encryption_key_version int,
  target_connected_by uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_connection_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube connections may only be stored by the service role.';
  end if;
  if target_store_id !~ '^[0-9]+$' then
    raise exception 'Tiendanube store ID is invalid.';
  end if;

  insert into public.tiendanube_connections (
    store_id, scopes, status, connected_by, connected_at, disconnected_at, revoked_at, last_sync_status, last_sync_error
  ) values (
    target_store_id, coalesce(target_scopes, '{}'::text[]), 'connected', target_connected_by, now(), null, null, 'idle', null
  ) on conflict (store_id) do update set
    scopes = excluded.scopes,
    status = 'connected',
    connected_by = excluded.connected_by,
    connected_at = now(),
    disconnected_at = null,
    revoked_at = null,
    last_sync_status = 'idle',
    last_sync_error = null
  returning id into target_connection_id;

  insert into public.tiendanube_connection_secrets (
    connection_id, encrypted_access_token, encryption_key_version, rotated_at
  ) values (
    target_connection_id, target_encrypted_access_token, target_encryption_key_version, now()
  ) on conflict (connection_id) do update set
    encrypted_access_token = excluded.encrypted_access_token,
    encryption_key_version = excluded.encryption_key_version,
    rotated_at = now();

  return target_connection_id;
end;
$$;
revoke all on function public.store_tiendanube_connection(text, text[], text, int, uuid) from public;
grant execute on function public.store_tiendanube_connection(text, text[], text, int, uuid) to service_role;
-- END: supabase/migrations/009_tiendanube_foundation.sql

-- ============================================================================
-- BEGIN: supabase/migrations/010_tiendanube_workers.sql
-- ============================================================================
-- Durable work claims for Tiendanube. These functions are service-role only.
alter table public.tiendanube_webhook_events add column if not exists locked_at timestamptz;
alter table public.tiendanube_privacy_requests add column if not exists locked_at timestamptz;
create index tiendanube_webhook_events_claim_idx on public.tiendanube_webhook_events (status, locked_at, received_at);
create index tiendanube_privacy_requests_claim_idx on public.tiendanube_privacy_requests (status, locked_at, received_at);

create or replace function public.claim_tiendanube_sync_runs(batch_size integer default 1)
returns setof public.tiendanube_sync_runs language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube sync work may only be claimed by the service role.';
  end if;

  return query
  with candidates as (
    select id
    from public.tiendanube_sync_runs
    where status = 'queued'
      or (status = 'running' and started_at < now() - interval '15 minutes' and finished_at is null)
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 1), 10))
  )
  update public.tiendanube_sync_runs sync_run
  set status = 'running', started_at = now()
  from candidates
  where sync_run.id = candidates.id
  returning sync_run.*;
end;
$$;
revoke execute on function public.claim_tiendanube_sync_runs(integer) from public;
grant execute on function public.claim_tiendanube_sync_runs(integer) to service_role;

create or replace function public.enqueue_tiendanube_incremental_syncs()
returns integer language plpgsql security definer set search_path = public as $$
declare
  queued_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube sync work may only be queued by the service role.';
  end if;

  with candidates as (
    select connection.id
    from public.tiendanube_connections connection
    where connection.status = 'connected'
      and (connection.last_synced_at is null or connection.last_synced_at < now() - interval '15 minutes')
      and not exists (
        select 1
        from public.tiendanube_sync_runs sync_run
        where sync_run.connection_id = connection.id
          and sync_run.status in ('queued', 'running')
      )
    order by connection.last_synced_at nulls first
    for update skip locked
    limit 10
  ), queued_connections as (
    update public.tiendanube_connections connection
    set last_sync_status = 'queued', last_sync_error = null
    from candidates
    where connection.id = candidates.id
    returning connection.id
  )
  insert into public.tiendanube_sync_runs (connection_id, kind)
  select id, 'incremental'
  from queued_connections;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;
revoke execute on function public.enqueue_tiendanube_incremental_syncs() from public;
grant execute on function public.enqueue_tiendanube_incremental_syncs() to service_role;

create or replace function public.claim_tiendanube_webhook_events(batch_size integer default 10)
returns setof public.tiendanube_webhook_events language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube webhook work may only be claimed by the service role.';
  end if;

  return query
  with candidates as (
    select id
    from public.tiendanube_webhook_events
    where status = 'queued'
      or (status = 'processing' and locked_at < now() - interval '15 minutes')
    order by received_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 10), 25))
  )
  update public.tiendanube_webhook_events webhook_event
  set status = 'processing',
      processing_attempts = webhook_event.processing_attempts + 1,
      locked_at = now()
  from candidates
  where webhook_event.id = candidates.id
  returning webhook_event.*;
end;
$$;
revoke execute on function public.claim_tiendanube_webhook_events(integer) from public;
grant execute on function public.claim_tiendanube_webhook_events(integer) to service_role;

create or replace function public.claim_tiendanube_privacy_requests(batch_size integer default 10)
returns setof public.tiendanube_privacy_requests language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Tiendanube privacy work may only be claimed by the service role.';
  end if;

  return query
  with candidates as (
    select id
    from public.tiendanube_privacy_requests
    where status = 'queued'
      or (status = 'processing' and locked_at < now() - interval '15 minutes')
    order by received_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 10), 25))
  )
  update public.tiendanube_privacy_requests privacy_request
  set status = 'processing', locked_at = now()
  from candidates
  where privacy_request.id = candidates.id
  returning privacy_request.*;
end;
$$;
revoke execute on function public.claim_tiendanube_privacy_requests(integer) from public;
grant execute on function public.claim_tiendanube_privacy_requests(integer) to service_role;
-- END: supabase/migrations/010_tiendanube_workers.sql

-- ============================================================================
-- BEGIN: supabase/migrations/011_course_asset_files.sql
-- ============================================================================
-- Extend course resources beyond video, PDF, images, text, and links.
alter type public.asset_type add value if not exists 'spreadsheet';
alter type public.asset_type add value if not exists 'document';
-- END: supabase/migrations/011_course_asset_files.sql

-- ============================================================================
-- BEGIN: supabase/migrations/012_harden_user_access.sql
-- ============================================================================
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
-- END: supabase/migrations/012_harden_user_access.sql

-- ============================================================================
-- BEGIN: supabase/migrations/013_module_primary_video.sql
-- ============================================================================
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

create trigger assets_clear_previous_primary_module_video
  before insert or update of is_primary, module_id on public.assets
  for each row execute function public.clear_previous_primary_module_video();
-- END: supabase/migrations/013_module_primary_video.sql

-- ============================================================================
-- BEGIN: supabase/migrations/014_resource_progress.sql
-- ============================================================================
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
-- END: supabase/migrations/014_resource_progress.sql

-- ============================================================================
-- BEGIN: supabase/migrations/015_auth_user_deletion_recovery.sql
-- ============================================================================
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
-- END: supabase/migrations/015_auth_user_deletion_recovery.sql

-- ============================================================================
-- BEGIN: supabase/migrations/016_video_progress_refresh.sql
-- ============================================================================
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
-- END: supabase/migrations/016_video_progress_refresh.sql

-- ============================================================================
-- BEGIN: supabase/migrations/017_storage_unlimited_uploads.sql
-- ============================================================================
update storage.buckets
set file_size_limit = 53687091200
where id in ('course-media', 'manuals');
-- END: supabase/migrations/017_storage_unlimited_uploads.sql

-- ============================================================================
-- BEGIN: supabase/migrations/018_course_covers_and_duration.sql
-- ============================================================================
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
-- END: supabase/migrations/018_course_covers_and_duration.sql

-- ============================================================================
-- BEGIN: supabase/migrations/019_large_course_media_uploads.sql
-- ============================================================================
update storage.buckets
set file_size_limit = 53687091200
where id in ('course-media', 'manuals');

select pg_notify('pgrst', 'reload schema');
-- END: supabase/migrations/019_large_course_media_uploads.sql

-- ============================================================================
-- BEGIN: supabase/migrations/020_video_posters.sql
-- ============================================================================
alter table public.assets
  add column if not exists video_poster_storage_path text;

select pg_notify('pgrst', 'reload schema');
-- END: supabase/migrations/020_video_posters.sql

-- ============================================================================
-- BEGIN: supabase/seed.sql
-- ============================================================================
-- Intentionally empty. Operational users, franchises, courses, and manuals are
-- created from the administration workflow after the first real administrator.
-- END: supabase/seed.sql

select pg_notify('pgrst', 'reload schema');
commit;

