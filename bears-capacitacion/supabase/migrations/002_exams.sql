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
create index exam_answers_attempt_id_idx on public.exam_answers (attempt_id);