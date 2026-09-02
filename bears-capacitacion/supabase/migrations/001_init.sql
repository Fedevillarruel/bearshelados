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
create index video_progress_user_id_idx on public.video_progress (user_id);