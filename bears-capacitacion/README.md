# Bears Helados | Capacitación

Plataforma interna de cursos, manuales y seguimiento operativo para administración, franquicias y equipos de Bears Helados.

## Requisitos

- Node.js 20 o superior
- Proyecto de Supabase
- Cuenta de Vercel para producción

## Desarrollo local

1. Instalá dependencias con `npm install`.
2. Copiá `.env.example` a `.env.local` y completá las variables necesarias.
3. Aplicá la base de datos siguiendo uno de los flujos siguientes.
4. Ejecutá `npm run dev`.

### Proyecto Supabase vacío

Ejecutá una sola vez `supabase/setup-completo.sql` en el SQL Editor. El archivo instala el esquema, RLS, buckets privados, automatizaciones y la base de Tiendanube en una transacción; no crea usuarios, franquicias, cursos ni métricas de ejemplo.

Después, creá la primera cuenta en **Authentication > Users > Add user** con confirmación automática y promovela desde el SQL Editor:

```sql
update public.profiles
set role = 'admin', is_super_admin = true
where email = 'tu-correo@dominio.com';
```

Creá las franquicias, personas, cursos y manuales reales desde el panel de administración.

### Proyecto remoto parcial existente

No ejecutes nuevamente `supabase/setup-completo.sql` ni `supabase/seed.sql`: el seed está vacío de forma intencional. Aplicá las migraciones que falten, en orden:

```text
supabase/migrations/009_tiendanube_foundation.sql
supabase/migrations/010_tiendanube_workers.sql
supabase/migrations/011_course_asset_files.sql
supabase/migrations/012_harden_user_access.sql
supabase/migrations/013_module_primary_video.sql
supabase/migrations/014_resource_progress.sql
supabase/migrations/015_auth_user_deletion_recovery.sql
supabase/migrations/016_video_progress_refresh.sql
supabase/migrations/017_storage_unlimited_uploads.sql
supabase/migrations/018_course_covers_and_duration.sql
supabase/migrations/019_large_course_media_uploads.sql
```

La migración `015_auth_user_deletion_recovery.sql` habilita exclusivamente para `service_role` la recuperación de identidades que Supabase Auth no puede cargar al eliminarlas.

Si `public.profiles` no existe, la instalación anterior se revirtió antes de crear el esquema base. Comprobá que las tablas estén ausentes con:

```sql
select
	to_regclass('public.profiles') as profiles,
	to_regclass('public.franchises') as franchises,
	to_regclass('public.courses') as courses,
	to_regclass('public.exams') as exams;
```

Cuando las cuatro columnas devuelvan `null`, el proyecto está vacío a efectos de la aplicación: ejecutá la versión actual de `supabase/setup-completo.sql` una sola vez. El instalador ahora reutiliza de forma segura un administrador existente en Supabase Auth y crea su perfil activo.

Las migraciones son el historial para instalaciones incrementales. En un entorno existente que todavía no las tenga, aplicalas primero en orden numérico. `007_admin_user.sql` quedó deliberadamente vacío para evitar credenciales o cuentas predeterminadas.

No ejecutes nuevamente `setup-completo.sql` sobre una instalación existente.

## Variables de entorno

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SITE_URL=https://your-production-domain.example
TIENDANUBE_CLIENT_ID=
TIENDANUBE_CLIENT_SECRET=
TIENDANUBE_APP_USER_AGENT=BearsHeladosCapacitacion (federico@fedini.app)
TIENDANUBE_TOKEN_ENCRYPTION_KEY=
CRON_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY`, `TIENDANUBE_CLIENT_SECRET`, `TIENDANUBE_TOKEN_ENCRYPTION_KEY` y `CRON_SECRET` son exclusivamente server-side. Nunca deben llevar el prefijo `NEXT_PUBLIC_`, entrar a props, logs, tablas de navegador o URLs. Generá valores nuevos, por ejemplo:

```bash
openssl rand -base64 32  # TIENDANUBE_TOKEN_ENCRYPTION_KEY
openssl rand -base64 48  # CRON_SECRET
```

`SITE_URL` debe ser el origen canónico sin ruta. En desarrollo admite `http://localhost:3000`; en producción requiere HTTPS.

## Storage y acceso

- `course-media` y `manuals` son privados y se entregan con URLs firmadas de corta duración.
- Los cursos admiten videos MP4/WebM, PDF, imágenes, Excel/XLSX, CSV, Word y PowerPoint desde el gestor de contenido.
- `avatars` es público y está organizado por ID de usuario.
- Todas las tablas tienen RLS. Las Server Actions vuelven a validar roles en el servidor.
- El endpoint de video comprueba sesión y permiso sobre el activo antes de registrar rangos vistos.
- Las opciones de exámenes se califican del lado del servidor.

## Tiendanube

La integración es una capacidad exclusiva de superadministración. Solicita exactamente los scopes `read_orders` y `read_products`; no solicita acceso a clientes ni permisos de escritura.

En la configuración de la aplicación de Tiendanube, usá estas URLs con el dominio de `SITE_URL`:

```text
URL de redirección: /api/tiendanube/callback
Panel de administración: /admin/tiendanube
Webhook comercial: /api/tiendanube/webhooks
Webhook Store Redact: /api/tiendanube/webhooks
Webhook Customer Redact: /api/tiendanube/webhooks
Webhook Customers Data Request: /api/tiendanube/webhooks
```

La pantalla `/admin/tiendanube` inicia el flujo OAuth. El token recibido se cifra con AES-256-GCM y se guarda en una tabla sin acceso de navegador. Los webhooks verifican `x-linkedstore-hmac-sha256` contra el cuerpo crudo, conservan sólo metadatos operativos y se procesan en una cola.

`vercel.json` ejecuta `/api/cron/tiendanube` cada quince minutos. Vercel envía `Authorization: Bearer $CRON_SECRET` cuando esa variable está configurada. El plan de Vercel debe admitir esa frecuencia; de lo contrario, configurá un scheduler externo autenticado contra la misma ruta con una frecuencia equivalente.

## Producción

1. Configurá todas las variables de entorno necesarias en Vercel para cada ambiente.
2. En Supabase Auth, agregá las URLs permitidas:

```text
https://bearshelados.vercel.app
https://bearshelados.vercel.app/auth/callback
http://localhost:3000
http://localhost:3000/auth/callback
```

3. Ajustá el dominio real en `SITE_URL` y en las URLs registradas de Tiendanube.
4. Aplicá las migraciones correctas para el estado del proyecto antes de desplegar.
5. Probá login, rotación obligatoria de contraseña, roles y una autorización OAuth real antes de habilitar reportes comerciales.

## Verificación

```bash
npm run build
```

La aplicación no muestra información operativa cuando Supabase no está configurado. Los flujos de usuarios, cursos, manuales, reportes y Tiendanube requieren una configuración válida de Supabase.
