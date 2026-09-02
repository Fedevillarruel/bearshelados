# Bears Helados | Capacitación

Plataforma interna de cursos e inducción para administración, franquicias y personal de locales.

## Requisitos

- Node.js 20 o superior
- Un proyecto de Supabase
- Una cuenta de Vercel para producción

## Desarrollo local

1. Instalá las dependencias con `npm install`.
2. Copiá `.env.example` a `.env.local` y completá las tres variables.
3. Ejecutá las migraciones en Supabase SQL Editor, exactamente en este orden:

```text
001_init.sql
002_exams.sql
003_manuals.sql
004_rls.sql
005_storage.sql
006_platform_automation.sql
007_admin_user.sql (solo para la vía SQL de administrador)
```

4. Ejecutá `supabase/seed.sql` para cargar franquicias, cursos y datos demo.
5. Iniciá la aplicación con `npm run dev`.

## Variables de entorno

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` se utiliza exclusivamente desde código server-side para crear usuarios y para operaciones administrativas controladas. No debe declararse con prefijo `NEXT_PUBLIC_` ni exponerse al navegador.

## Usuario administrador inicial

### Vía A: Supabase Dashboard (recomendada)

1. Abrí **Authentication > Users > Add user**.
2. Creá `admin@bears-helados.com` con contraseña `Bears_2026_platform`.
3. Marcá **Auto Confirm User**.
4. Ejecutá:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador Bears', is_active = true, must_change_password = true
where email = 'admin@bears-helados.com';
```

### Vía B: SQL

Ejecutá `007_admin_user.sql`. Este enfoque inserta en las tablas internas de `auth` y puede requerir ajustes si Supabase cambia su esquema de Auth. En ambas vías, el perfil queda marcado para cambiar la contraseña en el primer acceso.

## Buckets de Storage

La migración `005_storage.sql` crea:

- `course-media`: público, para video, PDF e imágenes de cursos.
- `manuals`: privado, servido únicamente mediante signed URLs de corta duración.
- `avatars`: público, organizado por el ID de usuario.

No se deben publicar manuales ni usar una URL pública para sus descargas.

## Seguridad

- Todas las tablas tienen RLS activado.
- El franquiciado solo puede leer filas asociadas a su `franchise_id`.
- Las opciones de examen no tienen policy de lectura para empleados; el servidor corrige usando credenciales protegidas.
- El endpoint de video requiere sesión, permiso sobre el activo y acumula rangos vistos únicos.
- Las Server Actions vuelven a comprobar el rol incluso cuando la interfaz no ofrece la acción.

## Producción en Vercel

1. Importá el repositorio en Vercel.
2. Agregá las tres variables de entorno para Production, Preview y Development según corresponda.
3. Verificá que la URL de producción esté incluida en **Authentication > URL Configuration** de Supabase.
4. Desplegá. No se requiere `vercel.json` para este proyecto.

## Verificación

```bash
npm run build
```

La demo visual está disponible sin configuración de Supabase en `/admin/dashboard`. Para habilitar datos reales, login y persistencia, completá `.env.local` y aplicá las migraciones.This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
