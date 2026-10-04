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
supabase/migrations/020_video_posters.sql
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

### Cambio obligatorio de contraseña

La plataforma actualiza la contraseña con la sesión autenticada del usuario. Solo después de que Supabase Auth confirma el cambio, el servidor usa `SUPABASE_SERVICE_ROLE_KEY` para quitar `must_change_password` exclusivamente del perfil de esa sesión y verifica que se guardó antes de redirigir. No es necesario ampliar las políticas RLS de perfiles para permitir que los usuarios editen sus propios permisos.

Si Auth cambia la contraseña pero falla la confirmación del perfil, el formulario informa el resultado parcial y no redirige: la contraseña anterior ya no sirve. Se puede reintentar con otra contraseña nueva o pedir asistencia a administración. Las redirecciones del middleware conservan las cookies actualizadas de sesión.

## Storage y acceso

- `course-media` y `manuals` son privados y se entregan con URLs firmadas de corta duración.
- Los cursos admiten videos MP4/WebM, PDF, imágenes, Excel/XLSX, CSV, Word y PowerPoint desde el gestor de contenido.
- Las subidas de cursos, portadas y portadas de videos respetan el límite existente de `course-media`. Solo intentan ampliarlo al tamaño del archivo cuando es necesario; el límite global de Storage y el plan de Supabase siguen aplicando.
- `avatars` es público y está organizado por ID de usuario.
- Todas las tablas tienen RLS. Las Server Actions vuelven a validar roles en el servidor.
- El endpoint de video comprueba sesión y permiso sobre el activo antes de registrar rangos vistos.
- Las opciones de exámenes se califican del lado del servidor.

### Videos de YouTube en módulos

1. Creá un canal administrado por Bears y subí los videos como **No listado**, con **Permitir inserción** habilitado. No listado no es privado: cualquiera con el enlace puede verlo.
2. En el módulo, agregá contenido de tipo **Video** y pegá el enlace en **URL de YouTube o video externo**. No selecciones un archivo si querés usar YouTube.
3. Indicá la duración real en segundos (por ejemplo, 5 minutos = 300). Se utiliza para el porcentaje de avance, los requisitos de finalización y la duración del curso.
4. Si corresponde, marcá el video como principal del módulo y guardá.

Se admiten enlaces de reproducción (`watch?v=`), enlaces cortos (`youtu.be`), Shorts, directos y enlaces de inserción. Se guarda una URL canónica del video; los enlaces de canales o listas sin video se rechazan. El alumno reproduce dentro de la plataforma, retoma su posición y registra los rangos vistos. Saltar a un punto del video no acredita el tramo omitido; ver el video fuera de la plataforma no registra avance.

Si YouTube no puede cargar o el video es privado, eliminado o tiene la inserción bloqueada, el reproductor informa el problema y ofrece abrirlo en YouTube. No se cambia silenciosamente a un reproductor sin seguimiento. Las restricciones de edad, región y las políticas de YouTube también pueden impedir la reproducción integrada.

### Volver a ver videos

Completar un video o módulo no bloquea su reproducción. Los videos completados se abren desde el inicio; los pendientes retoman su posición guardada. Tanto YouTube como los archivos de Storage ofrecen **Volver a ver**, que reproduce desde cero sin borrar los rangos vistos ni el estado completado. Si un archivo no carga, el reproductor informa el problema y permite **Recargar video** para solicitar una URL firmada actualizada.

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
npm run test:youtube
npm run test:auth
npm run test:video
```

La aplicación no muestra información operativa cuando Supabase no está configurado. Los flujos de usuarios, cursos, manuales, reportes y Tiendanube requieren una configuración válida de Supabase.
