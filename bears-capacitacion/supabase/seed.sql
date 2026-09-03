-- Demo data. Run after 001 through 006. URLs are placeholders and must be replaced with Bears material.
-- This script can repair a schema-only installation after setup-completo.sql failed during seeding.
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'El esquema base no está instalado. Ejecutá primero supabase/setup-completo.sql en un proyecto vacío o aplicá las migraciones 001 a 006.';
  end if;
end;
$$;

begin;

insert into public.profiles (id, email, full_name, role, is_active, must_change_password)
select id, email, 'Administrador Bears', 'admin'::public.app_role, true, true
from auth.users
where email = 'admin@bears-helados.com'
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password;

insert into public.franchises (id, name, code, city) values
  ('a1000000-0000-0000-0000-000000000001', 'Bears Palermo', 'PAL', 'Buenos Aires'),
  ('a1000000-0000-0000-0000-000000000002', 'Bears Belgrano', 'BEL', 'Buenos Aires')
on conflict (id) do update set name = excluded.name;

-- WARNING: demo auth inserts use Supabase Auth internals. Use Admin API for production users.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000001','authenticated','authenticated','franquicia.palermo@bears-helados.com',crypt('Bears_Demo_2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Valentina Suárez","role":"franquiciado","franchise_id":"a1000000-0000-0000-0000-000000000001"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000002','authenticated','authenticated','franquicia.belgrano@bears-helados.com',crypt('Bears_Demo_2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Martín Costa","role":"franquiciado","franchise_id":"a1000000-0000-0000-0000-000000000002"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000011','authenticated','authenticated','lucia.fernandez@bears-helados.com',crypt('Bears_Demo_2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Lucía Fernández","role":"empleado","franchise_id":"a1000000-0000-0000-0000-000000000001"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000012','authenticated','authenticated','mateo.rivas@bears-helados.com',crypt('Bears_Demo_2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Mateo Rivas","role":"empleado","franchise_id":"a1000000-0000-0000-0000-000000000001"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000013','authenticated','authenticated','sofia.carrizo@bears-helados.com',crypt('Bears_Demo_2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Sofía Carrizo","role":"empleado","franchise_id":"a1000000-0000-0000-0000-000000000002"}',now(),now()),
('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000014','authenticated','authenticated','tomas.molina@bears-helados.com',crypt('Bears_Demo_2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"Tomás Molina","role":"empleado","franchise_id":"a1000000-0000-0000-0000-000000000002"}',now(),now())
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, jsonb_build_object('sub', id::text, 'email', email), 'email', email, now(), now(), now()
from auth.users where id::text like 'b1000000-%'
on conflict (provider, provider_id) do nothing;

update public.profiles set
  role = case id
    when 'b1000000-0000-0000-0000-000000000001' then 'franquiciado'::public.app_role
    when 'b1000000-0000-0000-0000-000000000002' then 'franquiciado'::public.app_role
    else 'empleado'::public.app_role
  end,
  franchise_id = case id
    when 'b1000000-0000-0000-0000-000000000001' then 'a1000000-0000-0000-0000-000000000001'::uuid
    when 'b1000000-0000-0000-0000-000000000002' then 'a1000000-0000-0000-0000-000000000002'::uuid
    when 'b1000000-0000-0000-0000-000000000011' then 'a1000000-0000-0000-0000-000000000001'::uuid
    when 'b1000000-0000-0000-0000-000000000012' then 'a1000000-0000-0000-0000-000000000001'::uuid
    when 'b1000000-0000-0000-0000-000000000013' then 'a1000000-0000-0000-0000-000000000002'::uuid
    when 'b1000000-0000-0000-0000-000000000014' then 'a1000000-0000-0000-0000-000000000002'::uuid
  end,
  position = case id
  when 'b1000000-0000-0000-0000-000000000011' then 'Encargada de salón'
  when 'b1000000-0000-0000-0000-000000000012' then 'Atención al cliente'
  when 'b1000000-0000-0000-0000-000000000013' then 'Cajera'
  when 'b1000000-0000-0000-0000-000000000014' then 'Heladero'
  else position end,
  last_seen_at = now() - interval '2 days'
where id::text like 'b1000000-%';

insert into public.courses (id, title, slug, description, summary, category, estimated_minutes, is_published, order_index) values
('c1000000-0000-0000-0000-000000000001','Inducción Bears','induccion-bears','Recorrido inicial obligatorio para todo el personal que ingresa a un local Bears. Cubre la identidad de la marca, los estándares de calidad, la experiencia que esperamos que viva el cliente y la operación diaria del punto de venta.','El recorrido esencial para incorporarte a Bears.','Inducción',86,true,0),
('c1000000-0000-0000-0000-000000000002','Caja y arqueo','caja-y-arqueo','Formación operativa para registrar ventas, realizar cierres y reportar diferencias con precisión.','Caja segura, ordenada y trazable.','Operación',35,true,1)
on conflict (id) do update set title = excluded.title;

insert into public.modules (id, course_id, title, description, order_index) values
('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Bienvenida','Primeros pasos en la cultura Bears.',1),
('d1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','Introducción a la empresa','Historia, locales y propuesta de valor.',2),
('d1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','Misión, visión y valores','La identidad que guía nuestras decisiones.',3),
('d1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000001','Estándares de calidad','Producto, orden y control en cada turno.',4),
('d1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000001','Experiencia bears','Atención cercana, ágil y consistente.',5),
('d1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000001','Tipo de visitas','Cómo reconocer y atender diferentes necesidades.',6),
('d1000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000001','Uniforme e higiene','Presentación, lavado de manos y seguridad.',7),
('d1000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000001','Vestuario','Uso, cuidado y reposición de prendas.',8),
('d1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000001','Manejo de stock','Recepción, guardado y rotación FIFO.',9),
('d2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','Apertura de caja','Preparación de fondo y registro inicial.',1),
('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','Operación durante el turno','Cobros, comprobantes y cuidados.',2),
('d2000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000002','Arqueo y cierre','Conteo, informe y entrega responsable.',3)
on conflict (id) do update set title = excluded.title;

-- PLACEHOLDER: reemplazar por el material real desde el panel de administración.
insert into public.assets (module_id, type, title, description, url, duration_seconds, order_index) values
('d1000000-0000-0000-0000-000000000001','video','Video de bienvenida','Un saludo de la dirección de Bears.','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',165,1),
('d1000000-0000-0000-0000-000000000001','text','Empezamos juntos','Texto de apertura del recorrido.','<p>Cada visita importa.</p>',0,2),
('d1000000-0000-0000-0000-000000000002','video','Nuestra historia','Presentación institucional.','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',348,1),
('d1000000-0000-0000-0000-000000000002','pdf','Presentación institucional','PDF institucional de Bears.','https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',0,2),
('d1000000-0000-0000-0000-000000000002','image','Locales Bears','Galería de locales.','https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=1200&q=80',0,3),
('d1000000-0000-0000-0000-000000000003','text','Manifiesto de marca','Misión, visión y valores.','<p>Hacemos que lo cotidiano se sienta especial.</p>',0,1),
('d1000000-0000-0000-0000-000000000003','image','Manifiesto','Imagen del manifiesto de marca.','https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=1200&q=80',0,2),
('d1000000-0000-0000-0000-000000000004','video','Control de calidad','Checklist en acción.','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',517,1),
('d1000000-0000-0000-0000-000000000004','pdf','Checklist de calidad','Lista operativa de control.','https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',0,2),
('d1000000-0000-0000-0000-000000000005','video','Protocolo de atención','Recorrido de una atención Bears.','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',271,1),
('d1000000-0000-0000-0000-000000000005','text','Guion de saludo','Cómo iniciar una conversación con cada visita.','<p>Hola, bienvenida/o a Bears.</p>',0,2),
('d1000000-0000-0000-0000-000000000006','text','Perfiles de visita','Necesidades frecuentes de quienes nos visitan.','<p>Escuchá antes de recomendar.</p>',0,1),
('d1000000-0000-0000-0000-000000000006','image','Visita en familia','Ejemplo de atención en grupo.','https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=1200&q=80',0,2),
('d1000000-0000-0000-0000-000000000007','video','Higiene en el local','Normas básicas de higiene.','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',442,1),
('d1000000-0000-0000-0000-000000000007','pdf','Normas de higiene','Guía de higiene vigente.','https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',0,2),
('d1000000-0000-0000-0000-000000000008','image','Prendas Bears','Uso correcto de vestuario.','https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',0,1),
('d1000000-0000-0000-0000-000000000008','text','Cuidado y reposición','Cuidado de prendas y aviso de reposición.','<p>El uniforme limpio es parte del servicio.</p>',0,2),
('d1000000-0000-0000-0000-000000000009','video','Rotación FIFO','Carga y rotación de stock.','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',689,1),
('d1000000-0000-0000-0000-000000000009','pdf','Planilla de stock','Planilla de carga diaria.','https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',0,2),
('d1000000-0000-0000-0000-000000000009','text','Regla FIFO','El primero que entra es el primero que sale.','<p>Rotá el producto cada vez que recibís mercadería.</p>',0,3),
('d2000000-0000-0000-0000-000000000001','text','Fondo inicial','Registro de apertura.','<p>Contá el fondo frente al responsable.</p>',0,1),
('d2000000-0000-0000-0000-000000000002','video','Cobros seguros','Registro correcto de medios de pago.','https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',198,1),
('d2000000-0000-0000-0000-000000000003','text','Cierre responsable','Pasos para un arqueo claro.','<p>Informá cualquier diferencia antes de retirarte.</p>',0,1);

insert into public.enrollments (user_id, course_id, due_date, status, progress_percent, started_at, completed_at) values
('b1000000-0000-0000-0000-000000000011','c1000000-0000-0000-0000-000000000001',current_date + 7,'en_progreso',76,now() - interval '12 days',null),
('b1000000-0000-0000-0000-000000000012','c1000000-0000-0000-0000-000000000001',current_date - 2,'en_progreso',33,now() - interval '20 days',null),
('b1000000-0000-0000-0000-000000000013','c1000000-0000-0000-0000-000000000001',current_date - 5,'completado',100,now() - interval '30 days',now() - interval '4 days'),
('b1000000-0000-0000-0000-000000000014','c1000000-0000-0000-0000-000000000001',current_date + 10,'en_progreso',58,now() - interval '7 days',null),
('b1000000-0000-0000-0000-000000000011','c1000000-0000-0000-0000-000000000002',current_date + 30,'asignado',0,null,null)
on conflict (user_id, course_id) do update set progress_percent = excluded.progress_percent, status = excluded.status;

insert into public.exams (id, course_id, module_id, title, passing_score, max_attempts, cooldown_minutes, shuffle_questions, shuffle_options, show_correct_answers, blocks_progress) values
('e1000000-0000-0000-0000-000000000003',null,'d1000000-0000-0000-0000-000000000003','Valores Bears',70,3,60,true,true,false,true),
('e1000000-0000-0000-0000-000000000004',null,'d1000000-0000-0000-0000-000000000004','Control de calidad',70,3,60,true,true,false,true),
('e1000000-0000-0000-0000-000000000005',null,'d1000000-0000-0000-0000-000000000005','Experiencia Bears',70,3,60,true,true,false,true),
('e1000000-0000-0000-0000-000000000006',null,'d1000000-0000-0000-0000-000000000006','Tipos de visitas',70,3,60,true,true,false,true),
('e1000000-0000-0000-0000-000000000007',null,'d1000000-0000-0000-0000-000000000007','Uniforme e higiene',70,3,60,true,true,false,true),
('e1000000-0000-0000-0000-000000000008',null,'d1000000-0000-0000-0000-000000000008','Vestuario Bears',70,3,60,true,true,false,true),
('e1000000-0000-0000-0000-000000000009',null,'d1000000-0000-0000-0000-000000000009','Manejo de stock',70,3,60,true,true,false,true),
('e1000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000001',null,'Evaluación final — Inducción Bears',80,2,0,true,true,true,true),
('e2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002',null,'Evaluación - Caja y arqueo',70,3,30,true,true,false,true)
on conflict (id) do update set title = excluded.title;

update public.exams set time_limit_minutes = 20 where id = 'e1000000-0000-0000-0000-000000000010';

do $$
declare item jsonb; inserted_question uuid; question_index int := 0;
begin
  for item in select * from jsonb_array_elements('[
    {"exam":"e1000000-0000-0000-0000-000000000003","prompt":"¿Qué debe guiar una decisión frente a una visita con una necesidad especial?","answer":"Escuchar, cuidar la experiencia y pedir apoyo si hace falta"},
    {"exam":"e1000000-0000-0000-0000-000000000003","prompt":"¿Cómo se vuelve concreto el valor de cercanía en un turno?","answer":"Saludando, escuchando y recomendando con atención"},
    {"exam":"e1000000-0000-0000-0000-000000000003","prompt":"¿Qué actitud sostiene la calidad Bears cuando el local está ocupado?","answer":"Respetar el estándar aun bajo presión"},
    {"exam":"e1000000-0000-0000-0000-000000000003","prompt":"¿Qué hacer si una práctica habitual contradice un valor de la marca?","answer":"Hablarlo con el responsable y corregirla"},
    {"exam":"e1000000-0000-0000-0000-000000000004","prompt":"¿Cuándo debe hacerse el control visual de las vitrinas?","answer":"Al iniciar el turno y durante toda la operación"},
    {"exam":"e1000000-0000-0000-0000-000000000004","prompt":"¿Qué se hace ante un producto que no cumple el estándar visual?","answer":"Retirarlo e informar al responsable"},
    {"exam":"e1000000-0000-0000-0000-000000000004","prompt":"¿Por qué se completa el checklist de calidad?","answer":"Para asegurar consistencia y detectar desvíos a tiempo"},
    {"exam":"e1000000-0000-0000-0000-000000000004","prompt":"¿Cómo deben mantenerse las superficies de trabajo?","answer":"Limpias, ordenadas y libres de elementos ajenos"},
    {"exam":"e1000000-0000-0000-0000-000000000004","prompt":"¿Quién es responsable de la calidad durante el turno?","answer":"Todo el equipo, cada uno en su tarea"},
    {"exam":"e1000000-0000-0000-0000-000000000005","prompt":"¿Cuál es el primer paso de una atención Bears?","answer":"Dar la bienvenida y observar la necesidad de la visita"},
    {"exam":"e1000000-0000-0000-0000-000000000005","prompt":"¿Cómo se recomienda un sabor cuando alguien duda?","answer":"Haciendo preguntas breves y ofreciendo una prueba cuando corresponda"},
    {"exam":"e1000000-0000-0000-0000-000000000005","prompt":"¿Qué hacer ante un reclamo?","answer":"Escuchar sin interrumpir, agradecer el aviso y buscar una solución"},
    {"exam":"e1000000-0000-0000-0000-000000000005","prompt":"¿Qué evita una espera innecesaria en fila?","answer":"Reconocer a quien llega y coordinar al equipo"},
    {"exam":"e1000000-0000-0000-0000-000000000005","prompt":"¿Cómo se cierra una buena atención?","answer":"Confirmando que la visita recibió lo que necesitaba y despidiendo con calidez"},
    {"exam":"e1000000-0000-0000-0000-000000000006","prompt":"¿Cómo conviene atender a una familia con niñas y niños?","answer":"Escuchando al grupo y facilitando una decisión simple"},
    {"exam":"e1000000-0000-0000-0000-000000000006","prompt":"¿Qué necesita una visita apurada?","answer":"Claridad, agilidad y una recomendación directa"},
    {"exam":"e1000000-0000-0000-0000-000000000006","prompt":"¿Qué hacer cuando alguien necesita información sobre alérgenos?","answer":"Consultar la información oficial antes de responder"},
    {"exam":"e1000000-0000-0000-0000-000000000006","prompt":"¿Cuál es la clave para una visita habitual?","answer":"Reconocer sus preferencias sin asumir ni invadir"},
    {"exam":"e1000000-0000-0000-0000-000000000007","prompt":"¿Cuándo corresponde lavarse las manos?","answer":"Al comenzar, al cambiar de tarea y cuando sea necesario"},
    {"exam":"e1000000-0000-0000-0000-000000000007","prompt":"¿Cómo debe verse el uniforme al iniciar el turno?","answer":"Limpio, completo y en buen estado"},
    {"exam":"e1000000-0000-0000-0000-000000000007","prompt":"¿Qué se hace si el uniforme se ensucia durante la operación?","answer":"Avisar y reemplazarlo según el procedimiento"},
    {"exam":"e1000000-0000-0000-0000-000000000007","prompt":"¿Se permite usar accesorios que comprometan la higiene?","answer":"No, deben evitarse según las normas vigentes"},
    {"exam":"e1000000-0000-0000-0000-000000000007","prompt":"¿Por qué la higiene es parte del servicio?","answer":"Porque protege el producto, al equipo y a cada visita"},
    {"exam":"e1000000-0000-0000-0000-000000000008","prompt":"¿Quién debe informar que necesita reposición de una prenda?","answer":"La persona que detecta el desgaste o falta"},
    {"exam":"e1000000-0000-0000-0000-000000000008","prompt":"¿Cómo se cuida el vestuario de trabajo?","answer":"Siguiendo las indicaciones de lavado y guardándolo correctamente"},
    {"exam":"e1000000-0000-0000-0000-000000000008","prompt":"¿Por qué no se combinan prendas ajenas al uniforme?","answer":"Porque la presentación debe ser consistente y segura"},
    {"exam":"e1000000-0000-0000-0000-000000000009","prompt":"¿Qué significa la regla FIFO?","answer":"El primer producto que ingresa es el primero que debe salir"},
    {"exam":"e1000000-0000-0000-0000-000000000009","prompt":"¿Qué se verifica al recibir mercadería?","answer":"Cantidad, estado, temperatura y fecha según el procedimiento"},
    {"exam":"e1000000-0000-0000-0000-000000000009","prompt":"¿Cuándo se registra una diferencia de stock?","answer":"En el momento de detectarla e informando al responsable"},
    {"exam":"e1000000-0000-0000-0000-000000000009","prompt":"¿Dónde se ubica el producto recién recibido?","answer":"Detrás o debajo del producto existente para respetar FIFO"},
    {"exam":"e1000000-0000-0000-0000-000000000009","prompt":"¿Por qué se realiza el control diario de stock?","answer":"Para prevenir faltantes, mermas y errores de operación"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Qué conducta expresa la experiencia Bears?","answer":"Recibir a cada visita con atención y calidez"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Qué estándar no se negocia aunque haya mucho trabajo?","answer":"La higiene y la calidad del producto"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Cuál es la secuencia correcta para el stock?","answer":"Recibir, controlar, registrar y rotar FIFO"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Qué debe hacerse antes de responder sobre alérgenos?","answer":"Consultar la información oficial disponible"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Qué hacer ante un reclamo?","answer":"Escuchar, agradecer y gestionar una solución"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Cómo debe estar el uniforme?","answer":"Limpio, completo y adecuado a la tarea"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Qué uso tiene el checklist?","answer":"Sostener el estándar y detectar desvíos"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Cómo se recomienda un producto?","answer":"Escuchando y adaptando la sugerencia a la visita"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Quién cuida la calidad del local?","answer":"Todo el equipo durante todo el turno"},
    {"exam":"e1000000-0000-0000-0000-000000000010","prompt":"¿Qué hacer ante una práctica que no representa a Bears?","answer":"Corregirla y pedir apoyo al responsable"},
    {"exam":"e2000000-0000-0000-0000-000000000001","prompt":"¿Qué se hace antes de iniciar los cobros?","answer":"Contar y registrar el fondo inicial"},
    {"exam":"e2000000-0000-0000-0000-000000000001","prompt":"¿Cómo se informa una diferencia en el arqueo?","answer":"De inmediato y siguiendo el procedimiento"},
    {"exam":"e2000000-0000-0000-0000-000000000001","prompt":"¿Qué permite un cierre claro?","answer":"Registrar cada medio de pago y contar con orden"}
  ]'::jsonb)
  loop
    question_index := question_index + 1;
    insert into public.questions (exam_id, prompt, explanation, order_index)
    values ((item->>'exam')::uuid, item->>'prompt', 'Revisá el contenido del módulo para reforzar este estándar.', question_index)
    returning id into inserted_question;
    insert into public.options (question_id, label, is_correct, order_index) values
      (inserted_question, item->>'answer', true, 1),
      (inserted_question, 'Ignorar el estándar para resolver más rápido', false, 2),
      (inserted_question, 'Esperar a que otra persona tome la decisión', false, 3),
      (inserted_question, 'Aplicar un criterio personal sin consultar', false, 4);
  end loop;
end $$;

insert into public.video_progress (user_id, asset_id, seconds_watched, last_position, total_seconds, watched_ranges, completed, updated_at)
select 'b1000000-0000-0000-0000-000000000011', id, duration_seconds * 0.92, duration_seconds, duration_seconds, jsonb_build_array(jsonb_build_array(0, floor(duration_seconds * 0.92))), true, now() - interval '1 day'
from public.assets where type = 'video' and module_id in ('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000004')
on conflict (user_id, asset_id) do nothing;

insert into public.exam_attempts (exam_id, user_id, attempt_number, score, correct_count, total_questions, passed, started_at, finished_at, duration_seconds) values
('e1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000011',1,80,4,5,true,now()-interval '4 days',now()-interval '4 days'+interval '8 minutes',480),
('e1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000012',1,40,2,5,false,now()-interval '3 days',now()-interval '3 days'+interval '7 minutes',420),
('e1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000012',2,80,4,5,true,now()-interval '1 day',now()-interval '1 day'+interval '6 minutes',360),
('e1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000013',1,90,9,10,true,now()-interval '4 days',now()-interval '4 days'+interval '12 minutes',720)
on conflict (exam_id, user_id, attempt_number) do nothing;

insert into public.manual_categories (id, name, order_index) values
('f1000000-0000-0000-0000-000000000001','Operación',1),
('f1000000-0000-0000-0000-000000000002','Calidad y seguridad',2)
on conflict (id) do nothing;
insert into public.manuals (title, description, category_id, file_url, file_type) values
('Manual de operaciones del local','Versión vigente para apertura, atención y cierre.','f1000000-0000-0000-0000-000000000001','manuales/operaciones.pdf','application/pdf'),
('Estándares de calidad y servicio','Puntos de control del turno.','f1000000-0000-0000-0000-000000000002','manuales/calidad.pdf','application/pdf');

select pg_notify('pgrst', 'reload schema');
commit;