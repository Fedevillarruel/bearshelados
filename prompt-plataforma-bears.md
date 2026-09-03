# PROMPT MAESTRO — Plataforma interna de capacitación "Bears Helados"

> Pegá este documento completo como primer mensaje en Claude Code, Cursor, Lovable, v0 o similar.
> Está escrito para que la IA no tenga que inventar nada: el esquema de datos, las políticas de seguridad y el sistema de diseño ya vienen definidos.

---

## 0) Rol y encargo

Actuá como un equipo senior de producto: un arquitecto full-stack (Next.js + Supabase) y un director de arte de estudio de diseño. Vas a construir, de punta a punta y listo para desplegar en Vercel, una **plataforma web interna de cursos e inducción de personal** para **Bears Helados**, una cadena de heladerías con locales propios y franquicias.

No entregues un esqueleto ni un "MVP para completar después". Entregá la aplicación funcionando completa, con datos semilla, SQL para ejecutar a mano en Supabase y todas las pantallas de los tres roles construidas.

**Antes de escribir una sola línea de código**, devolveme:
1. El plan de arquitectura (rutas, capas, dónde vive cada cosa).
2. El plan de diseño (tokens de color, tipografías con rol asignado, escala tipográfica, concepto de layout con wireframes en ASCII de las 4 pantallas principales).
3. Las dudas que tengas, si las hay.

Recién después de que apruebe eso, empezás a construir. Trabajá en tandas: infraestructura y auth → panel admin → panel empleado → panel franquiciado → pulido visual y QA.

---

## 1) Stack obligatorio

- **Next.js 15** (App Router, Server Components por defecto, Server Actions para mutaciones).
- **TypeScript** en modo estricto.
- **Tailwind CSS** + **shadcn/ui** como base de componentes (personalizada, no con los estilos de fábrica).
- **Supabase**: Auth (email + password), Postgres con **RLS activo en todas las tablas**, y Storage para archivos.
- **Recharts** para gráficos.
- **lucide-react** para iconografía.
- **Zod** + **react-hook-form** para validación de formularios (validá también del lado del servidor, nunca confíes solo en el cliente).
- **@tanstack/react-table** para las tablas de datos del panel admin (orden, filtro, búsqueda, paginación).
- Video: **Mux Player** si hay presupuesto, o `<video>` nativo envuelto en un componente propio con control de progreso. Elegí `<video>` nativo por defecto para no agregar costos.
- Deploy: **Vercel**. Incluí `vercel.json` si hace falta y documentá las variables de entorno.

**Variables de entorno** (documentalas en `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # SOLO server-side, jamás expuesta al cliente
```

La `SERVICE_ROLE_KEY` se usa únicamente dentro de Route Handlers / Server Actions protegidos, para el alta de usuarios vía `supabase.auth.admin.createUser()`.

---

## 2) Identidad visual y dirección de arte

Esto no es negociable: la aplicación tiene que parecer un producto caro. Sobrio, denso en información donde corresponde, con aire donde corresponde. Referencias de nivel: Linear, Vercel Dashboard, Stripe.

### Logo
`https://dolltmxtcoawmpltsnrk.supabase.co/storage/v1/object/public/logo/lKkmRZZESHaaJgzufeQk_k9T3668M10wqK2R0.webp`

Usalo en sidebar, login, favicon y emails. Si el fondo es oscuro, resolvé el contraste con un contenedor, no deformando el logo.

### Paleta

| Token | Hex | Uso |
|---|---|---|
| `--ink` | `#0A0A0A` | Texto principal, fondos oscuros |
| `--paper` | `#FFFFFF` | Fondo base |
| `--surface` | `#F6F6F5` | Superficies elevadas, fondos de sección |
| `--line` | `#E4E4E2` | Bordes y divisores |
| `--muted` | `#6B6B68` | Texto secundario |
| `--jade` | `#339576` | Color de marca. Acciones primarias, progreso, estados de éxito |
| `--jade-deep` | `#1F6E56` | Hover / presionado del primario |
| `--sand` | `#EED683` | Acento secundario: destacados, badges, series de gráficos |
| `--sand-soft` | `#FAF3DC` | Fondos de aviso o resaltado suave |
| `--alert` | `#B4472F` | Errores, reprobado, destructivo |

Reglas duras:
- Monocromático como base. El color se **gana**: `--jade` y `--sand` son señales, no decoración. Si una pantalla tiene más de dos zonas de color, sacá una.
- Verificá contraste AA en todo. `--sand` sobre blanco no pasa: usalo como fondo con texto `--ink`, nunca como texto sobre claro.
- Nada de degradados decorativos, ni sombras genéricas `rgba(0,0,0,.1)` bajo cada tarjeta, ni el mismo radio de borde en todos los elementos sin jerarquía.
- Modo oscuro: implementalo con las mismas variables invertidas. `--jade` funciona bien sobre `--ink`.

### Tipografía
Dos familias como máximo, con roles distintos y explícitos. **No uses Inter** — es el default de todo dashboard generado. Buenas opciones: *Söhne* / *Geist* / *General Sans* para interfaz, y una familia de números tabulares para métricas. Definí una escala tipográfica real (1.25 o 1.333), con `font-variant-numeric: tabular-nums` en toda tabla y KPI.

Evitá los tells de página generada: eyebrows en mayúsculas sobre cada título, metadatos unidos con "·", flechitas "→" pegadas a cada botón, una palabra suelta coloreada dentro de un titular.

### Layout y movimiento
- Sidebar fija a la izquierda en escritorio (colapsable), barra inferior de navegación en móvil.
- Densidad alta en el panel admin, densidad baja y foco en el reproductor del lado del empleado.
- Movimiento solo como respuesta a una acción del usuario: abrir, expandir, confirmar, marcar completado. Nada de fade-and-slide-up en cada sección al hacer scroll. Respetá `prefers-reduced-motion`.
- Estados vacíos con dirección ("Todavía no tenés cursos asignados. Tu supervisor te va a asignar el primero."), nunca un ícono gris con "No hay datos".
- Skeletons reales durante la carga, no spinners centrados.

### Responsive
Mobile-first de verdad, no un escritorio encogido. El empleado va a usar esto desde el teléfono en el local: el reproductor de video, el visor de PDF y el examen tienen que ser cómodos con una sola mano. Objetivos táctiles de 44px mínimo.

---

## 3) Roles y reglas de acceso

| Rol | Puede |
|---|---|
| `admin` | Todo. Crea usuarios (empleados, franquiciados y otros admins), crea y edita cursos, módulos, contenidos y exámenes, asigna cursos, ve todas las métricas de todos, gestiona manuales y franquicias. |
| `franquiciado` | Ve **únicamente** a los empleados asignados a su franquicia: progreso, notas de examen, minutos de video. Accede a la sección de manuales e instructivos. No crea ni edita nada. No ve datos de otras franquicias. |
| `empleado` | Ve sus cursos asignados, consume el contenido, rinde exámenes, ve su propio progreso e historial. Nada más. |

El aislamiento entre franquicias se aplica **en la base de datos vía RLS**, no solo escondiendo botones en la interfaz. Un franquiciado que llame a la API a mano no debe poder leer nada de otra franquicia.

---

## 4) Esquema de base de datos — SQL para ejecutar manualmente

Entregame estos scripts en archivos separados dentro de `/supabase/migrations/`, numerados y listos para pegar en el SQL Editor de Supabase en orden. El esquema de abajo es el contrato: respetalo. Si necesitás agregar una columna, agregala, pero no renombres ni elimines lo que está acá.

### 4.1 — Extensiones, tipos y tablas base

```sql
-- 001_init.sql
create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'franquiciado', 'empleado');
create type public.asset_type as enum ('video', 'pdf', 'image', 'text', 'link');
create type public.enrollment_status as enum ('asignado', 'en_progreso', 'completado');

-- Franquicias
create table public.franchises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Perfiles (1:1 con auth.users)
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
create index on public.profiles (franchise_id);
create index on public.profiles (role);

-- Cursos
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  summary text,
  cover_url text,
  category text,
  estimated_minutes int default 0,
  is_published boolean not null default false,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Módulos
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
create index on public.modules (course_id, order_index);

-- Contenidos: cuelgan del curso (nivel general) o de un módulo
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete cascade,
  type public.asset_type not null,
  title text not null,
  description text,
  url text not null,
  storage_path text,
  duration_seconds int default 0,   -- obligatorio > 0 para type = 'video'
  size_bytes bigint,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  constraint asset_parent_check check (
    (course_id is not null and module_id is null)
    or (course_id is null and module_id is not null)
  )
);
create index on public.assets (module_id, order_index);
create index on public.assets (course_id, order_index);

-- Asignación de cursos
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  due_date date,
  status public.enrollment_status not null default 'asignado',
  progress_percent numeric(5,2) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  unique (user_id, course_id)
);
create index on public.enrollments (user_id);
create index on public.enrollments (course_id);

-- Progreso por módulo
create table public.module_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  is_completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, module_id)
);

-- Progreso de video (segundos efectivamente reproducidos, sin contar saltos)
create table public.video_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  seconds_watched int not null default 0,
  last_position int not null default 0,
  total_seconds int not null default 0,
  watched_ranges jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  first_played_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, asset_id)
);
create index on public.video_progress (user_id);
```

### 4.2 — Exámenes

```sql
-- 002_exams.sql
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete cascade,
  title text not null,
  description text,
  passing_score numeric(5,2) not null default 70,   -- % necesario para aprobar
  max_attempts int,                                 -- null = intentos ilimitados
  cooldown_minutes int not null default 0,          -- espera obligatoria entre intentos
  time_limit_minutes int,                           -- null = sin límite
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  show_correct_answers boolean not null default false,
  blocks_progress boolean not null default true,    -- si no aprueba, no avanza al módulo siguiente
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
  points numeric(5,2) not null default 1,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.questions (exam_id, order_index);

create table public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);
create index on public.options (question_id, order_index);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number int not null default 1,
  score numeric(5,2),
  correct_count int,
  total_questions int,
  passed boolean,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_seconds int
);
create index on public.exam_attempts (user_id, exam_id);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  is_correct boolean not null default false
);
create index on public.exam_answers (attempt_id);
```

### 4.3 — Manuales e instructivos

```sql
-- 003_manuals.sql
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
  version int not null default 1,
  visible_to public.app_role[] not null default array['admin','franquiciado']::public.app_role[],
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 4.4 — Funciones auxiliares, trigger de alta y RLS

```sql
-- 004_rls.sql

-- SECURITY DEFINER para evitar recursión infinita al consultar profiles dentro de sus propias policies
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_franchise_id()
returns uuid language sql stable security definer set search_path = public as $$
  select franchise_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- Crear el perfil automáticamente al crear el usuario en auth
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
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Activar RLS en todo
alter table public.franchises        enable row level security;
alter table public.profiles          enable row level security;
alter table public.courses           enable row level security;
alter table public.modules           enable row level security;
alter table public.assets            enable row level security;
alter table public.enrollments       enable row level security;
alter table public.module_progress   enable row level security;
alter table public.video_progress    enable row level security;
alter table public.exams             enable row level security;
alter table public.questions         enable row level security;
alter table public.options           enable row level security;
alter table public.exam_attempts     enable row level security;
alter table public.exam_answers      enable row level security;
alter table public.manuals           enable row level security;
alter table public.manual_categories enable row level security;

-- PROFILES
create policy "perfil propio" on public.profiles
  for select using (id = auth.uid());
create policy "admin ve todos los perfiles" on public.profiles
  for select using (public.is_admin());
create policy "franquiciado ve su franquicia" on public.profiles
  for select using (
    public.current_app_role() = 'franquiciado'
    and franchise_id = public.current_franchise_id()
  );
create policy "admin gestiona perfiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "editar perfil propio" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_app_role());

-- FRANQUICIAS
create policy "lectura de franquicias" on public.franchises
  for select using (
    public.is_admin() or id = public.current_franchise_id()
  );
create policy "admin gestiona franquicias" on public.franchises
  for all using (public.is_admin()) with check (public.is_admin());

-- CURSOS / MÓDULOS / ASSETS: lectura para inscriptos, escritura solo admin
create policy "ver cursos asignados" on public.courses
  for select using (
    public.is_admin()
    or public.current_app_role() = 'franquiciado'
    or exists (
      select 1 from public.enrollments e
      where e.course_id = courses.id and e.user_id = auth.uid()
    )
  );
create policy "admin gestiona cursos" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

create policy "ver modulos" on public.modules
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.course_id = modules.course_id and e.user_id = auth.uid()
    )
  );
create policy "admin gestiona modulos" on public.modules
  for all using (public.is_admin()) with check (public.is_admin());

create policy "ver assets" on public.assets
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.user_id = auth.uid()
        and (
          e.course_id = assets.course_id
          or e.course_id = (select m.course_id from public.modules m where m.id = assets.module_id)
        )
    )
  );
create policy "admin gestiona assets" on public.assets
  for all using (public.is_admin()) with check (public.is_admin());

-- ENROLLMENTS
create policy "ver inscripciones propias" on public.enrollments
  for select using (user_id = auth.uid());
create policy "admin ve inscripciones" on public.enrollments
  for select using (public.is_admin());
create policy "franquiciado ve inscripciones de su franquicia" on public.enrollments
  for select using (
    public.current_app_role() = 'franquiciado'
    and exists (
      select 1 from public.profiles p
      where p.id = enrollments.user_id
        and p.franchise_id = public.current_franchise_id()
    )
  );
create policy "admin gestiona inscripciones" on public.enrollments
  for all using (public.is_admin()) with check (public.is_admin());
create policy "actualizar progreso propio" on public.enrollments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- PROGRESO (module_progress y video_progress comparten el mismo patrón)
create policy "progreso propio modulo" on public.module_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin ve progreso modulo" on public.module_progress
  for select using (public.is_admin());
create policy "franquiciado ve progreso modulo" on public.module_progress
  for select using (
    public.current_app_role() = 'franquiciado'
    and exists (select 1 from public.profiles p
                where p.id = module_progress.user_id
                  and p.franchise_id = public.current_franchise_id())
  );

create policy "progreso propio video" on public.video_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin ve progreso video" on public.video_progress
  for select using (public.is_admin());
create policy "franquiciado ve progreso video" on public.video_progress
  for select using (
    public.current_app_role() = 'franquiciado'
    and exists (select 1 from public.profiles p
                where p.id = video_progress.user_id
                  and p.franchise_id = public.current_franchise_id())
  );

-- EXÁMENES: el empleado ve el examen y las preguntas, NUNCA is_correct antes de responder
create policy "ver examenes" on public.exams
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.user_id = auth.uid()
        and (e.course_id = exams.course_id
             or e.course_id = (select m.course_id from public.modules m where m.id = exams.module_id))
    )
  );
create policy "admin gestiona examenes" on public.exams
  for all using (public.is_admin()) with check (public.is_admin());

create policy "ver preguntas" on public.questions
  for select using (
    public.is_admin()
    or exists (select 1 from public.exams x where x.id = questions.exam_id)
  );
create policy "admin gestiona preguntas" on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admin gestiona opciones" on public.options
  for all using (public.is_admin()) with check (public.is_admin());
-- Las opciones se sirven al empleado desde el servidor, con is_correct removido.

create policy "intentos propios" on public.exam_attempts
  for select using (user_id = auth.uid());
create policy "crear intento propio" on public.exam_attempts
  for insert with check (user_id = auth.uid());
create policy "admin ve intentos" on public.exam_attempts
  for select using (public.is_admin());
create policy "franquiciado ve intentos de su franquicia" on public.exam_attempts
  for select using (
    public.current_app_role() = 'franquiciado'
    and exists (select 1 from public.profiles p
                where p.id = exam_attempts.user_id
                  and p.franchise_id = public.current_franchise_id())
  );

create policy "respuestas propias" on public.exam_answers
  for select using (
    exists (select 1 from public.exam_attempts a
            where a.id = exam_answers.attempt_id and a.user_id = auth.uid())
  );
create policy "admin ve respuestas" on public.exam_answers
  for select using (public.is_admin());

-- MANUALES
create policy "ver manuales segun rol" on public.manuals
  for select using (public.current_app_role() = any (visible_to));
create policy "admin gestiona manuales" on public.manuals
  for all using (public.is_admin()) with check (public.is_admin());
create policy "ver categorias" on public.manual_categories
  for select using (auth.uid() is not null);
create policy "admin gestiona categorias" on public.manual_categories
  for all using (public.is_admin()) with check (public.is_admin());
```

### 4.5 — Storage

```sql
-- 005_storage.sql
insert into storage.buckets (id, name, public)
values ('course-media','course-media', true),
       ('manuals','manuals', false),
       ('avatars','avatars', true)
on conflict (id) do nothing;

create policy "lectura publica media" on storage.objects
  for select using (bucket_id = 'course-media');
create policy "admin sube media" on storage.objects
  for insert with check (bucket_id = 'course-media' and public.is_admin());
create policy "admin edita media" on storage.objects
  for update using (bucket_id = 'course-media' and public.is_admin());
create policy "admin borra media" on storage.objects
  for delete using (bucket_id = 'course-media' and public.is_admin());

create policy "manuales autenticados" on storage.objects
  for select using (
    bucket_id = 'manuals'
    and public.current_app_role() in ('admin','franquiciado')
  );
create policy "admin gestiona manuales storage" on storage.objects
  for all using (bucket_id = 'manuals' and public.is_admin())
  with check (bucket_id = 'manuals' and public.is_admin());
```

Los manuales se sirven con **signed URLs** generadas del lado del servidor, con vencimiento corto.

### 4.6 — Usuario administrador semilla

Dame **las dos vías** documentadas en el README:

**Vía A (recomendada):** crear el usuario desde Supabase → Authentication → Add user, con email `admin@bears-helados.com` y contraseña `Bears_2026_platform`, marcando "Auto Confirm User". Después ejecutar:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador Bears', is_active = true
where email = 'admin@bears-helados.com';
```

**Vía B (todo por SQL):** incluí el script completo de `insert into auth.users (...)` usando `crypt('Bears_2026_platform', gen_salt('bf'))` e `insert into auth.identities`, con los campos `instance_id`, `aud`, `role`, `email_confirmed_at`, `raw_app_meta_data`, `raw_user_meta_data` correctamente poblados. Advertí en un comentario que esta vía depende de la estructura interna de `auth` y puede variar entre versiones de Supabase.

En ambos casos, la app debe forzar el cambio de contraseña en el primer inicio de sesión del admin (banner persistente, no bloqueante).

### 4.7 — Curso semilla: "Inducción Bears"

Sembrá un curso publicado con **exactamente estos nueve módulos, en este orden y con estos títulos textuales**. Es el recorrido obligatorio de todo ingresante.

**Curso:** `Inducción Bears`
`slug`: `induccion-bears` · `category`: `Inducción` · `is_published`: `true` · `order_index`: `0`
`description`: recorrido inicial obligatorio para todo el personal que ingresa a un local Bears. Cubre la identidad de la marca, los estándares de calidad, la experiencia que esperamos que viva el cliente y la operación diaria del punto de venta.

| # | Módulo | Contenido a sembrar | Examen |
|---|---|---|---|
| 1 | Bienvenida | Video de bienvenida (2–3 min) + texto de apertura | — |
| 2 | Introducción a la empresa | Video + PDF institucional + galería de imágenes de locales | — |
| 3 | Misión, visión y valores | Texto enriquecido + imagen del manifiesto de marca | 4 preguntas |
| 4 | Estándares de calidad | Video + PDF de checklist de calidad | 5 preguntas |
| 5 | Experiencia bears | Video de protocolo de atención + texto con el guion de saludo | 5 preguntas |
| 6 | Tipo de visitas | Texto + imágenes de los distintos perfiles de visita al local | 4 preguntas |
| 7 | Uniforme e higiene | Video + PDF de normas de higiene + galería de uniforme correcto/incorrecto | 5 preguntas |
| 8 | Vestuario | Imágenes de las prendas y su uso + texto de cuidado y reposición | 3 preguntas |
| 9 | Manejo de stock | Video de carga de stock + PDF de planilla + texto de rotación FIFO | 5 preguntas |

Reglas del seed:
- Cada módulo con al menos un `asset`. Los videos con `duration_seconds` real y distinto entre sí (entre 120 y 900 segundos) para que las métricas de minutos se vean creíbles.
- Los exámenes de módulo: `passing_score = 70`, `max_attempts = 3`, `cooldown_minutes = 60`, `shuffle_questions = true`, `blocks_progress = true`, `show_correct_answers = false`.
- Además, un **examen final a nivel curso** llamado `Evaluación final — Inducción Bears`, con 10 preguntas que recorran los nueve módulos, `passing_score = 80`, `max_attempts = 2`, `time_limit_minutes = 20`, `show_correct_answers = true`.
- Las preguntas tienen que ser reales y coherentes con el tema de cada módulo, no `Pregunta 1 / Opción A / Opción B`. Redactalas como las escribiría un capacitador de la cadena.
- Para los archivos usá placeholders con URLs públicas válidas (videos de muestra, PDFs de muestra, imágenes de heladería). Dejalos claramente identificados en el `seed.sql` con un comentario `-- PLACEHOLDER: reemplazar por el material real` para que se puedan sustituir después desde el panel.

Sembrá también un segundo curso corto, `Caja y arqueo`, con 3 módulos y un examen, para que el panel de administración no muestre un solo curso y se vean las comparativas entre cursos.

Creá además 2 franquicias de ejemplo, 1 usuario franquiciado por cada una y 4 empleados repartidos entre ellas, con progreso, minutos de video e intentos de examen ya sembrados (algunos aprobados, alguno reprobado con reintento) para que ningún dashboard se vea vacío en la demo.

---

## 5) Funcionalidad por rol

### 5.1 Panel de administrador

**Dashboard general**
- KPIs: usuarios activos, cursos publicados, tasa de finalización global, promedio de notas, horas de video consumidas, exámenes reprobados en los últimos 30 días.
- Gráfico de finalización por curso (barras).
- Gráfico de evolución de horas de video por semana (área).
- Comparativa por franquicia (barras agrupadas, `--jade` vs `--sand`).
- Tabla "requiere atención": empleados con curso vencido, con 2+ reprobados o sin actividad en 14 días.

**Usuarios**
- Alta con email + contraseña definida por el admin, nombre, rol, franquicia (obligatoria si el rol es `empleado` o `franquiciado`), puesto, teléfono.
- Se crea vía Server Action con `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, role, franchise_id } })`. Nunca desde el cliente.
- Alta masiva por CSV con previsualización y reporte de errores fila por fila.
- Generador de contraseña segura con botón de copiar, y opción "obligar cambio en el primer ingreso".
- Editar, desactivar (soft delete vía `is_active`), reasignar franquicia, resetear contraseña.
- Ficha de usuario: cursos asignados, progreso por módulo, minutos vistos vs. minutos totales, historial completo de intentos de examen con nota, fecha, duración y respuestas dadas.

**Cursos**
- ABM de cursos con portada, título, slug, descripción, resumen, categoría, orden y estado publicado/borrador.
- Constructor de módulos con reordenamiento drag-and-drop.
- Por curso **y** por módulo: subida de imágenes, videos, PDFs, texto enriquecido y enlaces. Subida con arrastrar y soltar, barra de progreso, previsualización y reordenamiento.
- Al subir un video, extraer la duración real en el cliente (`loadedmetadata`) y guardarla en `duration_seconds`. Es lo que sostiene toda la métrica de minutos.
- Asignación de cursos: selector múltiple de empleados con filtros por franquicia y por puesto, asignación en lote, fecha límite opcional.

**Constructor de exámenes**
- Se crea a nivel curso o a nivel módulo.
- Preguntas multiple choice con N opciones, una correcta, puntaje por pregunta y explicación opcional que se muestra al corregir.
- Configuración por examen, toda editable: nota de aprobación (%), cantidad máxima de intentos (o ilimitados), espera entre intentos, límite de tiempo, mezclar preguntas, mezclar opciones, mostrar respuestas correctas al finalizar, y si reprobar bloquea el avance al módulo siguiente.
- Vista previa del examen tal como lo ve el empleado.
- Resultados: tabla de todos los intentos, distribución de notas, y **análisis por pregunta** (qué pregunta falla más — sirve para detectar contenido mal explicado).

**Manuales e instructivos**
- ABM completo: título, descripción, categoría, archivo, visibilidad por rol.
- Reemplazar archivo conservando el registro e incrementando `version`.
- Eliminar con confirmación por escrito del título.
- Contador de descargas por manual.

**Franquicias**
- ABM de franquicias, asignación de su usuario franquiciado, listado de empleados y métricas agregadas.

### 5.2 Panel de franquiciado
- Dashboard con las mismas métricas que el admin pero **acotadas a su franquicia**.
- Listado de sus empleados: progreso, último acceso, cursos completados, promedio de notas.
- Ficha de detalle de cada empleado de su franquicia (solo lectura).
- Sección de manuales e instructivos con descarga.
- Exportación a CSV de las métricas de su equipo.
- Sin ningún acceso de escritura sobre cursos o usuarios.

### 5.3 Panel de empleado
- "Mis cursos": tarjetas con portada, progreso circular, estado y fecha límite.
- Vista de curso: índice de módulos a la izquierda (acordeón en móvil), contenido a la derecha.
- Reproductor de video con control de progreso, retomar donde quedó, velocidad de reproducción y marcado automático de módulo visto al superar el 90%.
- Visor de PDF embebido (no forzar descarga), galería de imágenes, contenido de texto legible.
- Examen: una pregunta por pantalla en móvil, todas listadas en escritorio, temporizador si está configurado, barra de avance, confirmación antes de entregar.
- Resultado inmediato: nota, aprobado/reprobado, y si el examen lo permite, revisión de respuestas con explicaciones.
- Si reprueba: mensaje claro con la nota obtenida, la nota requerida, cuántos intentos le quedan y cuándo puede reintentar.
- "Mi progreso": historial de cursos, notas y certificados de finalización descargables en PDF.

---

## 6) Medición de minutos de video — cómo debe funcionar

Esta métrica es la que más se falsea sola, así que implementala bien:

- Un hook `useVideoTracking` que envía un heartbeat cada **15 segundos** mientras el video está efectivamente reproduciéndose (no en pausa, no en otra pestaña — usá `visibilitychange`).
- Acumular **rangos de segundos únicos vistos** en `watched_ranges` (array de `[inicio, fin]` fusionados). Adelantar el video con la barra no debe sumar tiempo. Volver a ver un tramo ya visto tampoco lo suma dos veces.
- `seconds_watched` = suma de la longitud de los rangos fusionados.
- Marcar `completed = true` cuando `seconds_watched >= total_seconds * 0.9`.
- Escritura con `upsert` por `(user_id, asset_id)`, con debounce, tolerante a fallos de red (cola en memoria y reintento).
- En el panel admin, mostrar por usuario y curso: `minutos vistos / minutos totales` con barra de progreso y porcentaje, más el detalle video por video.

El progreso del curso (`enrollments.progress_percent`) se recalcula con un trigger o una función en Postgres: porcentaje de módulos completados, donde un módulo cuenta como completo si se vieron todos sus videos al 90% y se aprobó su examen (si tiene y si `blocks_progress` está activo).

---

## 7) Seguridad y calidad

- Middleware de Next que protege todas las rutas y redirige según rol: `/admin/*`, `/franquicia/*`, `/cursos/*`.
- Verificar el rol **del lado del servidor** en cada Server Action, nunca confiar en el estado del cliente.
- Las respuestas correctas (`options.is_correct`) jamás viajan al cliente antes de que el intento se entregue. La corrección se hace en el servidor.
- Validación con Zod en cliente y servidor.
- Manejo de errores con toasts descriptivos: qué pasó y cómo se arregla.
- Tipos de TypeScript generados desde el esquema de Supabase (`supabase gen types typescript`), commiteados en el repo.
- Accesibilidad: navegación completa por teclado, foco visible, labels en todos los campos, roles ARIA en las tablas y el reproductor.

---

## 8) Entregables

1. Repositorio completo, compilando sin errores ni warnings de TypeScript.
2. `/supabase/migrations/` con los scripts SQL numerados, en orden y listos para pegar en el editor de Supabase.
3. `/supabase/seed.sql` con franquicias, cursos, módulos, exámenes y usuarios de demostración.
4. `README.md` con: pasos de instalación, orden de ejecución del SQL, creación del admin, variables de entorno, configuración de los buckets y despliegue en Vercel.
5. `.env.example`.
6. Credenciales iniciales documentadas: `admin@bears-helados.com` / `Bears_2026_platform`.

---

## 9) Criterios de aceptación

Antes de darlo por terminado, verificá una por una:

- [ ] El admin inicia sesión y ve el dashboard con datos reales, no maquetas.
- [ ] El admin crea un empleado con email y contraseña, y ese empleado puede iniciar sesión de inmediato.
- [ ] El admin crea un curso con 3 módulos, sube un video, un PDF y una imagen, y arma un examen de 5 preguntas con aprobación al 60%.
- [ ] El admin asigna ese curso a dos empleados de franquicias distintas.
- [ ] El empleado ve el curso, mira el video, y los minutos aparecen en el panel del admin.
- [ ] El empleado rinde el examen, saca 3/5 (60%) y aprueba; con 2/5 reprueba y ve cuándo puede reintentar.
- [ ] La nota aparece en la ficha del empleado en el panel del admin.
- [ ] El franquiciado inicia sesión y ve **solo** a los empleados de su franquicia. Si intenta consultar por API el id de un empleado de otra franquicia, Postgres devuelve vacío.
- [ ] El franquiciado descarga un manual; el empleado no ve la sección de manuales.
- [ ] Todo funciona en un iPhone SE (375px de ancho) sin scroll horizontal.
- [ ] Modo oscuro coherente en todas las pantallas.
- [ ] Lighthouse: 90+ en rendimiento y accesibilidad.

---

## 10) Cómo trabajar

Construí por etapas y mostrame cada una antes de seguir. Al terminar cada etapa, hacé tu propia crítica de diseño: mirá las capturas, buscá lo que se ve genérico y corregilo. Si algo de este documento se contradice o no cierra, preguntame antes de improvisar.
