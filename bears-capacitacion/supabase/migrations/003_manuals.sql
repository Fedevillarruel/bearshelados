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
);